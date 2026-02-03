export interface Transport {
  send(data: Uint8Array): Promise<void>;
  onMessage(callback: (data: Uint8Array, peerId: string) => void): void;
  connect(roomKey: string): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  getPeers(): string[];
}

export type TransportStatus = 'disconnected' | 'connecting' | 'connected';

export interface TransportConfig {
  roomKey: string;
  peerId: string;
  signalingServer?: string;
  stunServers?: string[];
  turnServers?: RTCIceServer[];
  useDHT?: boolean;
}
