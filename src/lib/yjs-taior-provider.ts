import * as Y from 'yjs';
import type { Transport } from './transport';

export class TaiorProvider {
  private doc: Y.Doc;
  private transport: Transport;
  private roomKey: string;
  private synced = false;
  private updateHandler: ((update: Uint8Array, origin: any) => void) | null = null;

  constructor(doc: Y.Doc, roomKey: string, transport: Transport) {
    this.doc = doc;
    this.roomKey = roomKey;
    this.transport = transport;

    this.updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        this.transport.send(update).catch((err) => {
          console.error('Failed to send update:', err);
        });
      }
    };

    this.doc.on('update', this.updateHandler);

    this.transport.onMessage((data: Uint8Array, peerId: string) => {
      Y.applyUpdate(this.doc, data, this);
      if (!this.synced) {
        this.synced = true;
      }
    });
  }

  async connect(): Promise<void> {
    await this.transport.connect(this.roomKey);
    
    const stateVector = Y.encodeStateVector(this.doc);
    await this.transport.send(stateVector);
  }

  disconnect(): void {
    if (this.updateHandler) {
      this.doc.off('update', this.updateHandler);
      this.updateHandler = null;
    }
    this.transport.disconnect();
  }

  isSynced(): boolean {
    return this.synced;
  }

  getPeers(): string[] {
    return this.transport.getPeers();
  }
}
