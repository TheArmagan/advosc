//! Sound effect sidecar. Reads newline delimited JSON commands on stdin and writes newline
//! delimited JSON events on stdout. The engine owns this process's lifetime: when stdin
//! closes, for any reason, it exits.
//!
//! This stays a console subsystem exe like the other natives. The console is suppressed by
//! the parent spawning it with `windowsHide`, see `src/engine/audio/sidecar.ts`.

mod controller;
mod decode;
mod output;
mod protocol;
mod voice;

use std::io::BufRead;
use std::sync::{mpsc, Arc};
use std::time::Duration;

use controller::Controller;
use decode::Sound;
use protocol::{Command, Event};

/// How many files decode at once. More than this mostly just fights over the disk.
const DECODE_WORKERS: usize = 3;
/// Time the main thread gets to leave by itself after stdin closes.
const EXIT_GRACE: Duration = Duration::from_millis(500);

pub enum Msg {
    Command(Command),
    StdinClosed,
    Decoded {
        id: String,
        seq: u64,
        result: Result<Arc<Sound>, String>,
    },
    VoiceFinished {
        voice: u64,
        serial: u64,
    },
    StreamError {
        generation: u64,
    },
}

fn read_stdin(tx: mpsc::Sender<Msg>) {
    let mut stdin = std::io::stdin().lock();
    let mut line = Vec::new();

    loop {
        line.clear();
        // Bytes, not read_line, so a bad line is one error instead of a dead reader.
        match stdin.read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }

        let text = String::from_utf8_lossy(&line);
        let text = text.trim();
        if text.is_empty() {
            continue;
        }

        match serde_json::from_str::<Command>(text) {
            Ok(command) => {
                if tx.send(Msg::Command(command)).is_err() {
                    break;
                }
            }
            Err(e) => protocol::error(format!("bad_command: {e}")),
        }
    }

    let _ = tx.send(Msg::StdinClosed);
    // A device call can block forever on a broken driver. Don't let that keep us alive after
    // the parent has gone.
    std::thread::sleep(EXIT_GRACE);
    std::process::exit(0);
}

fn main() {
    let (tx, rx) = mpsc::channel();
    let jobs = decode::spawn_workers(DECODE_WORKERS, tx.clone());
    let mut controller = Controller::new(tx.clone(), jobs);

    std::thread::spawn({
        let tx = tx.clone();
        move || read_stdin(tx)
    });

    protocol::emit(&Event::Ready {
        version: env!("CARGO_PKG_VERSION"),
    });

    loop {
        let msg = match controller.tick_interval() {
            Some(interval) => rx.recv_timeout(interval),
            None => rx.recv().map_err(|_| mpsc::RecvTimeoutError::Disconnected),
        };

        match msg {
            Ok(Msg::Command(command)) => {
                if !controller.handle(command) {
                    break;
                }
            }
            Ok(Msg::StdinClosed) => break,
            Ok(Msg::Decoded { id, seq, result }) => controller.on_decoded(id, seq, result),
            Ok(Msg::VoiceFinished { voice, serial }) => controller.on_voice_finished(voice, serial),
            Ok(Msg::StreamError { generation }) => controller.on_stream_error(generation),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        controller.tick();
    }

    // Skips the stream's destructor, which waits on the audio thread.
    std::process::exit(0);
}
