import * as dgram from 'dgram';
import { EventEmitter } from 'events';

export interface OSCArg {
  type: 'N' | 'i' | 'f' | 's' | 'T' | 'F';
  value?: number | string | boolean;
}

export interface OSCMessage {
  address: string;
  args: OSCArg[];
}

export interface OSCEndpoint {
  address: string;
  port: number;
}

export interface OSCSource {
  local?: OSCEndpoint;
  remote?: OSCEndpoint;
}

export interface OSCOptions {
  sources: OSCSource[];
}

interface OSCSocketEntry extends OSCSource {
  socket: dgram.Socket;
  isOpen: boolean;
}

export class OSC extends EventEmitter {
  private entries: OSCSocketEntry[];
  private readyCount: number = 0;

  constructor(options: OSCOptions) {
    super();
    this.entries = options.sources.map(src => ({
      ...src,
      socket: dgram.createSocket('udp4'),
      isOpen: false,
    }));
    this.entries.forEach((_, i) => this.setupSocket(i));
  }

  get isOpen(): boolean {
    return this.entries.some(e => e.isOpen);
  }

  private setupSocket(index: number): void {
    const entry = this.entries[index];

    entry.socket.on('message', (buffer: Buffer) => {
      try {
        const message = this.parseOSCMessage(buffer);
        if (message) {
          this.emit('message', message);
        }
      } catch (error) {
        this.emit('error', error);
      }
    });

    entry.socket.on('error', (error: Error) => {
      if (!entry.isOpen) {
        console.log(`Failed to bind OSC socket [${index}]:`, error);
        return;
      }
      this.emit('error', error);
    });

    entry.socket.on('listening', () => {
      entry.isOpen = true;
      this.readyCount++;
      const localCount = this.entries.filter(e => e.local).length;
      if (this.readyCount === localCount) {
        this.emit('ready');
      }
    });
  }

  public open(): void {
    for (const entry of this.entries) {
      if (!entry.isOpen && entry.local) {
        entry.socket.bind(entry.local.port, entry.local.address);
      }
    }
  }

  public close(): void {
    let wasOpen = false;
    for (const entry of this.entries) {
      if (entry.isOpen) {
        entry.socket.close();
        entry.isOpen = false;
        wasOpen = true;
      }
    }
    this.readyCount = 0;
    if (wasOpen) {
      this.emit('close');
    }
  }

  // Sends to all open remotes by default; pass sourceIndex to target one.
  public send(message: OSCMessage, sourceIndex?: number): void {
    const targets = sourceIndex !== undefined
      ? [this.entries[sourceIndex]]
      : this.entries.filter(e => e.isOpen);

    if (targets.length === 0) {
      throw new Error('OSC socket is not open. Call open() first.');
    }

    const buffer = this.buildOSCMessage(message);
    for (const entry of targets) {
      if (!entry.remote) continue;
      entry.socket.send(buffer, entry.remote.port, entry.remote.address, (error) => {
        if (error) {
          this.emit('error', error);
        }
      });
    }
  }

  private buildOSCMessage(message: OSCMessage): Buffer {
    const parts: Buffer[] = [];

    const addressBuffer = this.toOSCString(message.address);
    parts.push(addressBuffer);

    let typeTags = ',';
    for (const arg of message.args) {
      typeTags += arg.type;
    }
    parts.push(this.toOSCString(typeTags));

    for (const arg of message.args) {
      switch (arg.type) {
        case 'i': {
          const buf = Buffer.alloc(4);
          buf.writeInt32BE(arg.value as number, 0);
          parts.push(buf);
          break;
        }
        case 'f': {
          const buf = Buffer.alloc(4);
          buf.writeFloatBE(arg.value as number, 0);
          parts.push(buf);
          break;
        }
        case 's':
          parts.push(this.toOSCString(arg.value as string));
          break;
        case 'T':
        case 'F':
        case 'N':
          break;
      }
    }

    return Buffer.concat(parts);
  }

  private parseOSCMessage(buffer: Buffer): OSCMessage | null {
    let offset = 0;

    const address = this.readOSCString(buffer, offset);
    if (!address) return null;
    offset += this.getOSCStringLength(address.value);

    const typeTags = this.readOSCString(buffer, offset);
    if (!typeTags || !typeTags.value.startsWith(',')) return null;
    offset += this.getOSCStringLength(typeTags.value);

    const args: OSCArg[] = [];
    const types = typeTags.value.slice(1);

    for (const type of types) {
      switch (type) {
        case 'i': {
          if (offset + 4 > buffer.length) return null;
          const value = buffer.readInt32BE(offset);
          args.push({ type: 'i', value });
          offset += 4;
          break;
        }
        case 'f': {
          if (offset + 4 > buffer.length) return null;
          const value = buffer.readFloatBE(offset);
          args.push({ type: 'f', value });
          offset += 4;
          break;
        }
        case 's': {
          const str = this.readOSCString(buffer, offset);
          if (!str) return null;
          args.push({ type: 's', value: str.value });
          offset += this.getOSCStringLength(str.value);
          break;
        }
        case 'T':
          args.push({ type: 'T', value: true });
          break;
        case 'F':
          args.push({ type: 'F', value: false });
          break;
        case 'N':
          args.push({ type: 'N' });
          break;
      }
    }

    return { address: address.value, args };
  }

  private toOSCString(str: string): Buffer {
    const nullTerminated = str + '\0';
    const byteLength = Buffer.byteLength(nullTerminated, 'utf8');
    const padding = 4 - (byteLength % 4);
    const totalLength = byteLength + (padding === 4 ? 0 : padding);
    const buffer = Buffer.alloc(totalLength);
    buffer.write(nullTerminated, 0, 'utf8');
    return buffer;
  }

  private readOSCString(buffer: Buffer, offset: number): { value: string } | null {
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0) {
      end++;
    }
    if (end >= buffer.length) return null;
    return { value: buffer.toString('utf8', offset, end) };
  }

  private getOSCStringLength(str: string): number {
    const nullTerminated = Buffer.byteLength(str, 'utf8') + 1;
    const padding = 4 - (nullTerminated % 4);
    return nullTerminated + (padding === 4 ? 0 : padding);
  }
}
