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

export interface OSCOptions {
  local: OSCEndpoint;
  remote: OSCEndpoint;
}

export class OSC extends EventEmitter {
  private socket: dgram.Socket;
  private local: OSCEndpoint;
  private remote: OSCEndpoint;
  private isOpen: boolean = false;

  constructor(options: OSCOptions) {
    super();
    this.local = options.local;
    this.remote = options.remote;
    this.socket = dgram.createSocket('udp4');
    this.setupSocket();
  }

  private setupSocket(): void {
    this.socket.on('message', (buffer: Buffer) => {
      try {
        const message = this.parseOSCMessage(buffer);
        if (message) {
          this.emit('message', message);
        }
      } catch (error) {
        this.emit('error', error);
      }
    });

    this.socket.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.socket.on('listening', () => {
      this.isOpen = true;
      this.emit('ready');
    });
  }

  public open(): void {
    if (!this.isOpen) {
      try {
        this.socket.bind(this.local.port, this.local.address);
      } catch (error) {
        this.emit('error', error);
        console.log('Failed to bind OSC socket:', error);
      }
    }
  }

  public close(): void {
    if (this.isOpen) {
      this.socket.close();
      this.isOpen = false;
      this.emit('close');
    }
  }

  public send(message: OSCMessage): void {
    if (!this.isOpen) {
      throw new Error('OSC socket is not open. Call open() first.');
    }

    const buffer = this.buildOSCMessage(message);
    this.socket.send(buffer, this.remote.port, this.remote.address, (error) => {
      if (error) {
        this.emit('error', error);
      }
    });
  }

  private buildOSCMessage(message: OSCMessage): Buffer {
    const parts: Buffer[] = [];

    // Address pattern
    const addressBuffer = this.toOSCString(message.address);
    parts.push(addressBuffer);

    // Type tag string
    let typeTags = ',';
    for (const arg of message.args) {
      typeTags += arg.type;
    }
    const typeTagBuffer = this.toOSCString(typeTags);
    parts.push(typeTagBuffer);

    // Arguments
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
          // These types have no data
          break;
      }
    }

    return Buffer.concat(parts);
  }

  private parseOSCMessage(buffer: Buffer): OSCMessage | null {
    let offset = 0;

    // Parse address
    const address = this.readOSCString(buffer, offset);
    if (!address) return null;
    offset += this.getOSCStringLength(address.value);

    // Parse type tags
    const typeTags = this.readOSCString(buffer, offset);
    if (!typeTags || !typeTags.value.startsWith(',')) return null;
    offset += this.getOSCStringLength(typeTags.value);

    // Parse arguments
    const args: OSCArg[] = [];
    const types = typeTags.value.slice(1); // Remove leading comma

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
