import type { Transport, TransportConfig } from './transport';

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'peer-list';
  from: string;
  to?: string;
  roomKey: string;
  data?: any;
}

export class WebRTCTransport implements Transport {
  private config: TransportConfig;
  private ws: WebSocket | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private messageCallback: ((data: Uint8Array, peerId: string) => void) | null = null;
  private connected = false;
  private pendingCandidates: Map<string, RTCIceCandidate[]> = new Map();

  constructor(config: TransportConfig) {
    this.config = {
      ...config,
      signalingServer: config.signalingServer || 'ws://localhost:8080',
      stunServers: config.stunServers || ['stun:stun.l.google.com:19302']
    };
  }

  async connect(roomKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.signalingServer!);

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({
          type: 'join',
          from: this.config.peerId,
          roomKey
        } as SignalingMessage));
      };

      this.ws.onmessage = async (event) => {
        const msg: SignalingMessage = JSON.parse(event.data);
        await this.handleSignalingMessage(msg);

        if (msg.type === 'peer-list') {
          this.connected = true;
          resolve();
        }
      };

      this.ws.onerror = (error) => {
        reject(error);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.cleanup();
      };

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private async handleSignalingMessage(msg: SignalingMessage): Promise<void> {
    if (msg.from === this.config.peerId) return;

    switch (msg.type) {
      case 'peer-list':
        for (const peerId of msg.data.peers || []) {
          if (peerId !== this.config.peerId && !this.peers.has(peerId)) {
            await this.createPeerConnection(peerId, true);
          }
        }
        break;

      case 'offer':
        await this.handleOffer(msg.from, msg.data);
        break;

      case 'answer':
        await this.handleAnswer(msg.from, msg.data);
        break;

      case 'ice-candidate':
        await this.handleIceCandidate(msg.from, msg.data);
        break;
    }
  }

  private async createPeerConnection(peerId: string, initiator: boolean): Promise<void> {
    const iceServers = [
      ...(this.config.turnServers || []),
      { urls: this.config.stunServers! }
    ];

    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: this.config.turnServers && this.config.turnServers.length > 0 
        ? 'relay' 
        : 'all',
      iceCandidatePoolSize: 0
    });

    this.peers.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          from: this.config.peerId,
          to: peerId,
          roomKey: this.config.roomKey,
          data: event.candidate
        } as SignalingMessage));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(peerId);
      }
    };

    if (initiator) {
      const channel = pc.createDataChannel('hush-data', {
        ordered: true,
        maxRetransmits: 3
      });
      this.setupDataChannel(peerId, channel);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'offer',
          from: this.config.peerId,
          to: peerId,
          roomKey: this.config.roomKey,
          data: offer
        } as SignalingMessage));
      }
    } else {
      pc.ondatachannel = (event) => {
        this.setupDataChannel(peerId, event.channel);
      };
    }
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    this.dataChannels.set(peerId, channel);

    channel.onopen = () => {
      console.log(`Data channel open with ${peerId}`);
    };

    channel.onmessage = (event) => {
      if (this.messageCallback) {
        const data = new Uint8Array(event.data);
        this.messageCallback(data, peerId);
      }
    };

    channel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
    };

    channel.onclose = () => {
      this.dataChannels.delete(peerId);
    };
  }

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    await this.createPeerConnection(peerId, false);
    const pc = this.peers.get(peerId)!;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const pending = this.pendingCandidates.get(peerId) || [];
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate);
    }
    this.pendingCandidates.delete(peerId);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (this.ws) {
      this.ws.send(JSON.stringify({
        type: 'answer',
        from: this.config.peerId,
        to: peerId,
        roomKey: this.config.roomKey,
        data: answer
      } as SignalingMessage));
    }
  }

  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peers.get(peerId);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    const pending = this.pendingCandidates.get(peerId) || [];
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate);
    }
    this.pendingCandidates.delete(peerId);
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peers.get(peerId);
    if (!pc) return;

    if (pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      if (!this.pendingCandidates.has(peerId)) {
        this.pendingCandidates.set(peerId, []);
      }
      this.pendingCandidates.get(peerId)!.push(new RTCIceCandidate(candidate));
    }
  }

  async send(data: Uint8Array): Promise<void> {
    const channels = Array.from(this.dataChannels.values());
    if (channels.length === 0) {
      throw new Error('No peers connected');
    }

    for (const channel of channels) {
      if (channel.readyState === 'open') {
        // Garantiza un ArrayBuffer respaldado (evita SharedArrayBuffer en tipos TS)
        const payload = new Uint8Array(data);
        channel.send(payload);
      }
    }
  }

  onMessage(callback: (data: Uint8Array, peerId: string) => void): void {
    this.messageCallback = callback;
  }

  disconnect(): void {
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private cleanup(): void {
    for (const channel of this.dataChannels.values()) {
      channel.close();
    }
    this.dataChannels.clear();

    for (const pc of this.peers.values()) {
      pc.close();
    }
    this.peers.clear();
    this.pendingCandidates.clear();
  }

  private removePeer(peerId: string): void {
    const channel = this.dataChannels.get(peerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(peerId);
    }

    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
  }

  isConnected(): boolean {
    return this.connected && this.dataChannels.size > 0;
  }

  getPeers(): string[] {
    return Array.from(this.peers.keys());
  }
}
