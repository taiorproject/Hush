import type { Transport, TransportConfig } from './transport';

export class BroadcastChannelTransport implements Transport {
  private channel: BroadcastChannel | null = null;
  private messageCallback: ((data: Uint8Array, peerId: string) => void) | null = null;
  private config: TransportConfig;
  private connected = false;

  constructor(config: TransportConfig) {
    this.config = config;
  }

  async connect(roomKey: string): Promise<void> {
    if (this.channel) {
      this.channel.close();
    }

    this.channel = new BroadcastChannel(`hush-room-${roomKey}`);
    this.channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { from?: string; update?: number[] };
      if (!data || data.from === this.config.peerId || !data.update) return;
      if (this.messageCallback) {
        const update = Uint8Array.from(data.update);
        this.messageCallback(update, data.from);
      }
    };

    this.connected = true;
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.channel) {
      throw new Error('Transport not connected');
    }
    this.channel.postMessage({
      from: this.config.peerId,
      update: Array.from(data)
    });
  }

  onMessage(callback: (data: Uint8Array, peerId: string) => void): void {
    this.messageCallback = callback;
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getPeers(): string[] {
    return [];
  }
}
