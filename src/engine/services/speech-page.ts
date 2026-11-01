/**
 * The page ADVOSC serves on localhost so the user can run speech recognition in Chrome.
 *
 * The Web Speech API (`webkitSpeechRecognition`) is not available inside Electron, so the
 * app hands the job to a real browser: this page listens, then posts every result back to
 * the local server, which forwards it to the renderer over IPC.
 *
 * It is one self-contained string on purpose. No build step touches it, no extra file has
 * to be copied into `dist/`, and there is nothing to load from the network.
 */
export function renderSpeechPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ADVOSC Speech</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0a0a0b;
    --panel: #141417;
    --border: #26262b;
    --text: #ededef;
    --muted: #8b8b94;
    --accent: #7c8cff;
    --good: #4ade80;
    --bad: #f87171;
    --warn: #fbbf24;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font: 14px/1.5 "Segoe UI", system-ui, -apple-system, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .wrap { width: 100%; max-width: 620px; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: center; gap: 12px; }
  h1 { font-size: 18px; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
  .badges { margin-left: auto; display: flex; gap: 8px; }
  .badge {
    font-size: 11px; padding: 3px 8px; border-radius: 999px;
    border: 1px solid var(--border); color: var(--muted); white-space: nowrap;
  }
  .badge.on { color: var(--good); border-color: rgba(74, 222, 128, 0.4); }
  .badge.off { color: var(--bad); border-color: rgba(248, 113, 113, 0.4); }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .transcript { min-height: 132px; display: flex; flex-direction: column; gap: 6px; }
  .final { font-size: 17px; }
  .interim { font-size: 17px; color: var(--muted); }
  .placeholder { color: var(--muted); font-style: italic; }
  .controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  button {
    font: inherit; font-weight: 500; cursor: pointer;
    border-radius: 9px; border: 1px solid var(--border);
    background: #1d1d22; color: var(--text); padding: 9px 18px;
  }
  button:hover { background: #26262c; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #0a0a0b; }
  button.primary:hover { filter: brightness(1.1); }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #3f3f46; display: inline-block; }
  .dot.live { background: var(--good); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  .meta { display: flex; gap: 16px; color: var(--muted); font-size: 12px; flex-wrap: wrap; }
  .note { color: var(--muted); font-size: 12px; }
  .error { color: var(--warn); font-size: 13px; min-height: 20px; }
  code { background: #202026; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span class="dot" id="dot"></span>
    <h1>ADVOSC Speech</h1>
    <div class="badges">
      <span class="badge" id="langBadge">-</span>
      <span class="badge" id="linkBadge">connecting</span>
    </div>
  </header>

  <div class="panel transcript">
    <div class="final" id="finalText"></div>
    <div class="interim" id="interimText"></div>
    <div class="placeholder" id="placeholder">Nothing heard yet. Press Start listening and talk.</div>
  </div>

  <div class="error" id="error"></div>

  <div class="controls">
    <button class="primary" id="toggle">Start listening</button>
    <button id="clear">Clear</button>
    <span class="meta"><span id="counter">0 results</span></span>
  </div>

  <div class="panel">
    <div class="meta" style="flex-direction: column; gap: 6px;">
      <div>Keep this tab open while you use the chatbox. Minimizing is fine, closing it stops recognition.</div>
      <div>Recognition language is set in ADVOSC, on the Speech module tab.</div>
      <div id="browserNote" class="note"></div>
    </div>
  </div>
</div>

<script>
(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get("t") || "";

  var config = {
    language: "en-US",
    interimResults: true,
    continuous: true,
    listening: false,
    maxAlternatives: 1
  };

  var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  /** What the app/user asked for. The engine itself stops on its own all the time. */
  var wantListening = false;
  /** True between onstart and onend, used to avoid double starts. */
  var engineRunning = false;
  var restartTimer = null;
  var sessionId = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  var resultCount = 0;
  var lastInterim = "";
  var lastInterimSentAt = 0;
  var interimTimer = null;

  var el = {
    dot: document.getElementById("dot"),
    lang: document.getElementById("langBadge"),
    link: document.getElementById("linkBadge"),
    final: document.getElementById("finalText"),
    interim: document.getElementById("interimText"),
    placeholder: document.getElementById("placeholder"),
    error: document.getElementById("error"),
    toggle: document.getElementById("toggle"),
    clear: document.getElementById("clear"),
    counter: document.getElementById("counter"),
    browserNote: document.getElementById("browserNote")
  };

  function post(path, body) {
    return fetch(path + "?t=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function () { /* the app may be closing; nothing useful to do */ });
  }

  function sendStatus(extra) {
    var payload = {
      sessionId: sessionId,
      listening: wantListening && engineRunning,
      wantListening: wantListening,
      language: config.language,
      supported: !!Ctor
    };
    for (var key in (extra || {})) payload[key] = extra[key];
    post("/status", payload);
  }

  function setError(message) {
    el.error.textContent = message || "";
  }

  function paint() {
    el.dot.className = wantListening && engineRunning ? "dot live" : "dot";
    el.toggle.textContent = wantListening ? "Stop listening" : "Start listening";
    el.lang.textContent = config.language;
    el.counter.textContent = resultCount + (resultCount === 1 ? " result" : " results");
    var empty = !el.final.textContent && !el.interim.textContent;
    el.placeholder.style.display = empty ? "block" : "none";
  }

  // ------------------------------------------------------------- recognition

  function buildRecognition() {
    var r = new Ctor();
    r.lang = config.language;
    r.continuous = config.continuous;
    r.interimResults = config.interimResults;
    r.maxAlternatives = Math.max(1, config.maxAlternatives || 1);

    r.onstart = function () {
      engineRunning = true;
      setError("");
      paint();
      sendStatus();
    };

    r.onresult = function (event) {
      var interim = "";
      for (var i = event.resultIndex; i < event.results.length; i++) {
        var result = event.results[i];
        var alternative = result[0];
        if (!alternative) continue;
        var text = (alternative.transcript || "").trim();
        if (result.isFinal) {
          if (!text) continue;
          resultCount++;
          el.final.textContent = text;
          el.interim.textContent = "";
          lastInterim = "";
          post("/transcript", {
            sessionId: sessionId,
            text: text,
            isFinal: true,
            confidence: typeof alternative.confidence === "number" ? alternative.confidence : null,
            language: config.language,
            at: Date.now()
          });
        } else {
          interim += alternative.transcript;
        }
      }

      if (interim) {
        el.interim.textContent = interim;
        queueInterim(interim.trim());
      }
      paint();
    };

    r.onerror = function (event) {
      var code = event.error;
      if (code === "no-speech" || code === "aborted") {
        // Normal in continuous use; the restart in onend handles it.
        return;
      }
      if (code === "not-allowed" || code === "service-not-allowed") {
        wantListening = false;
        setError("Microphone access was blocked. Allow the mic for this page, then press Start listening again.");
      } else if (code === "network") {
        setError("Speech service could not be reached. Chrome sends audio to Google for recognition, so this needs a working connection.");
      } else if (code === "audio-capture") {
        setError("No microphone was found.");
      } else {
        setError("Recognition error: " + code);
      }
      sendStatus({ error: code });
      paint();
    };

    r.onend = function () {
      engineRunning = false;
      paint();
      sendStatus();
      // Chrome ends the session on its own every so often, even in continuous mode,
      // so keep restarting it for as long as the user still wants to be listening.
      if (wantListening && !restartTimer) {
        restartTimer = setTimeout(function () {
          restartTimer = null;
          if (wantListening) startEngine();
        }, 250);
      }
    };

    return r;
  }

  function startEngine() {
    if (!Ctor || engineRunning) return;
    recognition = buildRecognition();
    try {
      recognition.start();
    } catch (e) {
      // "already started" races are harmless, anything else is worth showing.
      if (!/already/i.test(String(e && e.message))) setError(String(e && e.message ? e.message : e));
    }
  }

  function stopEngine() {
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (recognition) {
      try { recognition.stop(); } catch (e) { /* it was not running */ }
    }
  }

  function setListening(next) {
    if (wantListening === next) return;
    wantListening = next;
    if (next) startEngine(); else stopEngine();
    paint();
    sendStatus();
  }

  /** Interim text changes on almost every audio frame, so throttle it to ~4 posts a second. */
  function queueInterim(text) {
    if (!text || text === lastInterim) return;
    lastInterim = text;
    var now = Date.now();
    var wait = Math.max(0, 250 - (now - lastInterimSentAt));
    if (interimTimer) clearTimeout(interimTimer);
    interimTimer = setTimeout(function () {
      interimTimer = null;
      lastInterimSentAt = Date.now();
      post("/transcript", {
        sessionId: sessionId,
        text: lastInterim,
        isFinal: false,
        confidence: null,
        language: config.language,
        at: Date.now()
      });
    }, wait);
  }

  // ------------------------------------------------------------------ config

  function applyConfig(next) {
    var languageChanged = next.language !== config.language;
    var shapeChanged =
      next.interimResults !== config.interimResults ||
      next.continuous !== config.continuous ||
      next.maxAlternatives !== config.maxAlternatives;

    var listening = next.listening;
    config = {
      language: next.language || config.language,
      interimResults: !!next.interimResults,
      continuous: next.continuous !== false,
      listening: !!listening,
      maxAlternatives: next.maxAlternatives || 1
    };

    if ((languageChanged || shapeChanged) && wantListening) {
      // The settings are read when the session is created, so it has to be rebuilt.
      stopEngine();
      if (!restartTimer) {
        restartTimer = setTimeout(function () {
          restartTimer = null;
          if (wantListening) startEngine();
        }, 250);
      }
    }

    paint();
  }

  function connectEvents() {
    var source = new EventSource("/events?t=" + encodeURIComponent(token));

    source.onopen = function () {
      el.link.textContent = "connected";
      el.link.className = "badge on";
      sendStatus();
    };

    source.onmessage = function (event) {
      var message;
      try { message = JSON.parse(event.data); } catch (e) { return; }
      if (message.type === "config") applyConfig(message.config);
      if (message.type === "command") {
        if (message.action === "start") setListening(true);
        if (message.action === "stop") setListening(false);
        if (message.action === "clear") clearText();
      }
    };

    source.onerror = function () {
      el.link.textContent = "disconnected";
      el.link.className = "badge off";
      source.close();
      setTimeout(connectEvents, 1500);
    };
  }

  function clearText() {
    el.final.textContent = "";
    el.interim.textContent = "";
    lastInterim = "";
    paint();
  }

  // ------------------------------------------------------------------- setup

  el.toggle.addEventListener("click", function () { setListening(!wantListening); });
  el.clear.addEventListener("click", function () {
    clearText();
    post("/transcript", { sessionId: sessionId, text: "", isFinal: true, cleared: true, at: Date.now() });
  });

  window.addEventListener("beforeunload", function () {
    wantListening = false;
    sendStatus({ closing: true });
  });

  if (!Ctor) {
    el.toggle.disabled = true;
    setError("This browser has no Web Speech API. Open this page in Chrome or Edge.");
    el.browserNote.textContent = "Firefox and Safari do not implement webkitSpeechRecognition.";
  } else if (!window.chrome) {
    el.browserNote.textContent = "Recognition quality is best in Chrome or Edge.";
  }

  paint();
  connectEvents();
  sendStatus();
})();
</script>
</body>
</html>`;
}
