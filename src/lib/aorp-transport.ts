import type { Transport, TransportConfig } from './transport';

interface AORPNode {
  id: string;
  address: string;
  publicKey: Uint8Array;
  lastSeen: number;
}

interface Circuit {
  id: Uint8Array;
  nodes: AORPNode[];
  createdAt: number;
  ttl: number;
}

interface OnionLayer {
  encrypted: Uint8Array;
  nextHop: string;
}

export class AORPTransport implements Transport {
  private config: TransportConfig;
  private ws: WebSocket | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private messageCallback: ((data: Uint8Array, peerId: string) => void) | null = null;
  private connected = false;
  
  private circuits: Map<string, Circuit> = new Map();
  private knownNodes: Map<string, AORPNode> = new Map();
  private taiorWasm: any = null;
  
  private coverTrafficEnabled = true;
  private coverTrafficRate = 2.0;
  private lastCoverSent = 0;
  
  private minHops = 3;
  private maxHops = 5;
  private circuitTTL = 600000;
  private circuitRefreshInterval = 300000;

  constructor(config: TransportConfig) {
    this.config = {
      ...config,
      signalingServer: config.signalingServer || 'ws://localhost:8080',
      stunServers: config.stunServers || ['stun:stun.l.google.com:19302']
    };
  }

  async connect(roomKey: string): Promise<void> {
    await this.initializeTaiorWasm();
    
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.signalingServer!);

      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({
          type: 'join-anonymous',
          from: this.config.peerId,
          roomKey,
          mode: 'aorp'
        }));
      };

      this.ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        await this.handleSignalingMessage(msg);

        if (msg.type === 'peer-list') {
          await this.discoverNodes(msg.data.peers || []);
          await this.buildInitialCircuits();
          this.startCoverTraffic();
          this.connected = true;
          resolve();
        }
      };

      this.ws.onerror = (error) => reject(error);
      this.ws.onclose = () => {
        this.connected = false;
        this.cleanup();
      };

      setTimeout(() => {
        if (!this.connected) reject(new Error('Connection timeout'));
      }, 10000);
    });
  }

  private async initializeTaiorWasm(): Promise<void> {
    try {
      this.taiorWasm = null;
    } catch (error) {
      console.warn('Taior WASM no disponible, usando implementación JS:', error);
    }
  }

  private async discoverNodes(peerIds: string[]): Promise<void> {
    for (const peerId of peerIds) {
      if (peerId !== this.config.peerId && !this.knownNodes.has(peerId)) {
        this.knownNodes.set(peerId, {
          id: peerId,
          address: `peer://${peerId}`,
          publicKey: new Uint8Array(32),
          lastSeen: Date.now()
        });
        
        await this.createPeerConnection(peerId, false);
      }
    }
  }

  private async buildInitialCircuits(): Promise<void> {
    const nodeIds = Array.from(this.knownNodes.keys());
    
    if (nodeIds.length < this.minHops) {
      console.warn(`Solo ${nodeIds.length} nodos disponibles, se requieren ${this.minHops} para anonimato`);
      return;
    }

    const circuit = await this.buildCircuit(this.minHops);
    if (circuit) {
      this.circuits.set(circuit.id.toString(), circuit);
    }

    setInterval(() => this.refreshCircuits(), this.circuitRefreshInterval);
  }

  private async buildCircuit(targetHops: number): Promise<Circuit | null> {
    const availableNodes = Array.from(this.knownNodes.values())
      .filter(node => Date.now() - node.lastSeen < 60000);

    if (availableNodes.length < targetHops) {
      return null;
    }

    const selectedNodes: AORPNode[] = [];
    const usedIds = new Set<string>();

    for (let i = 0; i < targetHops; i++) {
      const candidates = availableNodes.filter(n => !usedIds.has(n.id));
      
      if (candidates.length === 0) break;

      let selected: AORPNode;
      
      if (this.taiorWasm && this.taiorWasm.decide_next_hop) {
        const candidateIds = candidates.map(c => c.id);
        const nextHopId = this.taiorWasm.decide_next_hop(candidateIds, targetHops - i);
        selected = candidates.find(c => c.id === nextHopId) || candidates[0];
      } else {
        selected = candidates[Math.floor(Math.random() * candidates.length)];
      }

      selectedNodes.push(selected);
      usedIds.add(selected.id);
    }

    if (selectedNodes.length < targetHops) {
      return null;
    }

    const circuitId = new Uint8Array(16);
    crypto.getRandomValues(circuitId);

    return {
      id: circuitId,
      nodes: selectedNodes,
      createdAt: Date.now(),
      ttl: this.circuitTTL
    };
  }

  private async refreshCircuits(): Promise<void> {
    const now = Date.now();
    
    for (const [id, circuit] of this.circuits.entries()) {
      if (now - circuit.createdAt > circuit.ttl) {
        this.circuits.delete(id);
      }
    }

    if (this.circuits.size === 0) {
      const circuit = await this.buildCircuit(this.minHops);
      if (circuit) {
        this.circuits.set(circuit.id.toString(), circuit);
      }
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
        : 'all'
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
        }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.removePeer(peerId);
        this.knownNodes.delete(peerId);
      }
    };

    if (initiator) {
      const channel = pc.createDataChannel('aorp-data', {
        ordered: false,
        maxRetransmits: 0
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
        }));
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
      const node = this.knownNodes.get(peerId);
      if (node) {
        node.lastSeen = Date.now();
      }
    };

    channel.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      this.handleOnionPacket(data, peerId);
    };

    channel.onerror = (error) => {
      console.error(`Canal AORP error con ${peerId}:`, error);
    };

    channel.onclose = () => {
      this.dataChannels.delete(peerId);
    };
  }

  private async handleSignalingMessage(msg: any): Promise<void> {
    if (msg.from === this.config.peerId) return;

    switch (msg.type) {
      case 'peer-list':
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

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    await this.createPeerConnection(peerId, false);
    const pc = this.peers.get(peerId)!;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (this.ws) {
      this.ws.send(JSON.stringify({
        type: 'answer',
        from: this.config.peerId,
        to: peerId,
        roomKey: this.config.roomKey,
        data: answer
      }));
    }
  }

  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peers.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peers.get(peerId);
    if (pc && pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  async send(data: Uint8Array): Promise<void> {
    const circuit = Array.from(this.circuits.values())[0];
    
    if (!circuit) {
      throw new Error('No hay circuitos disponibles');
    }

    const paddedData = this.addPadding(data);
    const onionPacket = await this.encryptOnion(paddedData, circuit);
    
    await this.sendToNextHop(onionPacket, circuit.nodes[0].id);
  }

  private addPadding(data: Uint8Array): Uint8Array {
    const targetSize = Math.ceil(data.length / 512) * 512;
    const padded = new Uint8Array(targetSize);
    padded.set(data);
    
    const paddingStart = data.length;
    const paddingLength = targetSize - data.length;
    
    if (paddingLength > 0) {
      const padding = new Uint8Array(paddingLength);
      crypto.getRandomValues(padding);
      padded.set(padding, paddingStart);
    }
    
    return padded;
  }

  private async encryptOnion(data: Uint8Array, circuit: Circuit): Promise<Uint8Array> {
    let encrypted = data;

    for (let i = circuit.nodes.length - 1; i >= 0; i--) {
      encrypted = await this.encryptLayer(encrypted, circuit.nodes[i]);
    }

    return encrypted;
  }

  private async encryptLayer(data: Uint8Array, node: AORPNode): Promise<Uint8Array> {
    const keyData = new Uint8Array(node.publicKey);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.buffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const dataBuffer = new Uint8Array(data).buffer;
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv.buffer },
      key,
      dataBuffer
    );

    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return result;
  }

  private async handleOnionPacket(data: Uint8Array, fromPeerId: string): Promise<void> {
    try {
      const decrypted = await this.decryptLayer(data);
      
      if (this.isForMe(decrypted)) {
        const payload = this.removePadding(decrypted);
        if (this.messageCallback && !this.isCoverTraffic(decrypted)) {
          this.messageCallback(payload, 'anonymous');
        }
      } else {
        const nextHop = this.extractNextHop(decrypted);
        if (nextHop) {
          await this.sendToNextHop(decrypted, nextHop);
        }
      }
    } catch (error) {
      console.error('Error procesando paquete onion:', error);
    }
  }

  private async decryptLayer(data: Uint8Array): Promise<Uint8Array> {
    return data;
  }

  private isForMe(data: Uint8Array): boolean {
    return true;
  }

  private isCoverTraffic(data: Uint8Array): boolean {
    return data[0] === 0xFF;
  }

  private removePadding(data: Uint8Array): Uint8Array {
    return data;
  }

  private extractNextHop(data: Uint8Array): string | null {
    return null;
  }

  private async sendToNextHop(data: Uint8Array, peerId: string): Promise<void> {
    const channel = this.dataChannels.get(peerId);
    if (channel && channel.readyState === 'open') {
      const jitter = Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, jitter));
      const payload = new Uint8Array(data);
      channel.send(payload);
    }
  }

  private startCoverTraffic(): void {
    if (!this.coverTrafficEnabled) return;

    setInterval(() => {
      if (this.shouldSendCover()) {
        this.sendCoverTraffic();
      }
    }, 500);
  }

  private shouldSendCover(): boolean {
    const now = Date.now();
    const interval = 1000 / this.coverTrafficRate;
    const jitter = (Math.random() - 0.5) * interval * 0.5;
    
    return now - this.lastCoverSent >= interval + jitter;
  }

  private async sendCoverTraffic(): Promise<void> {
    const circuit = Array.from(this.circuits.values())[0];
    if (!circuit) return;

    const size = 512 + Math.floor(Math.random() * 1536);
    const coverData = new Uint8Array(size);
    coverData[0] = 0xFF;
    crypto.getRandomValues(coverData.subarray(1));

    try {
      const onionPacket = await this.encryptOnion(coverData, circuit);
      await this.sendToNextHop(onionPacket, circuit.nodes[0].id);
      this.lastCoverSent = Date.now();
    } catch (error) {
      console.error('Error enviando cover traffic:', error);
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
    
    this.circuits.clear();
    this.knownNodes.clear();
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
    return this.connected && this.circuits.size > 0;
  }

  getPeers(): string[] {
    return Array.from(this.knownNodes.keys());
  }

  getCircuitInfo(): { count: number; minHops: number; maxHops: number } {
    return {
      count: this.circuits.size,
      minHops: this.minHops,
      maxHops: this.maxHops
    };
  }
}
