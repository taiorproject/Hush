import { createTaiorClient, type TaiorClient } from './taior';
import type { Transport, TransportConfig } from './transport';
import { SimpleDHT, type DHTNode } from './dht';

interface AORPNode {
  id: string;
  address: string;
  publicKey: Uint8Array;
  cryptoKey?: CryptoKey; // Cached imported key
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
  private taiorWasm: TaiorClient | null = null;
  private keyPair: CryptoKeyPair | null = null;

  private coverTrafficEnabled = true;
  private coverTrafficRate = 2.0;
  private lastCoverSent = 0;

  private minHops = 3;
  private maxHops = 5;
  private circuitTTL = 600000;
  private circuitRefreshInterval = 300000;
  private pendingHandshakes: Set<string> = new Set();
  private handshakeTimeout = 5000;
  private dht: SimpleDHT | null = null;
  private useDHT = false;

  constructor(config: TransportConfig) {
    this.config = {
      ...config,
      signalingServer: config.signalingServer || 'ws://localhost:8080',
      stunServers: config.stunServers || ['stun:stun.l.google.com:19302']
    };
    
    this.useDHT = config.useDHT ?? false;
    if (this.useDHT) {
      this.dht = new SimpleDHT({ nodeId: config.peerId });
      console.log('🔍 AORP: DHT habilitado para descubrimiento de peers');
    }
  }

  async connect(roomKey: string): Promise<void> {
    await this.initializeTaiorWasm();
    await this.generateKeyPair();

    if (this.useDHT && this.dht) {
      return this.connectViaDHT(roomKey);
    }

    return this.connectViaSignaling(roomKey);
  }

  private async connectViaDHT(roomKey: string): Promise<void> {
    if (!this.dht) {
      throw new Error('DHT no inicializado');
    }

    console.log('🔍 AORP: Conectando via DHT (sin signaling centralizado)');
    
    // Bootstrap nodes must match the relay infrastructure.
    // Use the same addresses configured in DEFAULT_RELAYS.
    const bootstrapNodes = [
      'wss://relay1.taior.net:4433',
      'wss://relay2.taior.net:4433'
    ];

    for (const node of bootstrapNodes) {
      this.dht.addBootstrapNode(node);
    }

    await this.dht.bootstrap();
    
    const discoveredNodes = this.dht.getAllNodes();
    await this.discoverNodes(discoveredNodes.map(n => n.id));
    await this.buildInitialCircuits();
    this.startCoverTraffic();
    this.connected = true;
  }

  private async connectViaSignaling(roomKey: string): Promise<void> {
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
          
          if (this.dht) {
            for (const peerId of msg.data.peers || []) {
              this.dht.addNode({
                id: peerId,
                address: `peer://${peerId}`,
                lastSeen: Date.now()
              });
            }
          }
          
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
      this.taiorWasm = await createTaiorClient();
      console.log('✅ AORP: libtaior WASM inicializado correctamente');
      
      if (!this.taiorWasm || typeof this.taiorWasm.send !== 'function') {
        throw new Error('libtaior WASM no exporta método send() requerido');
      }
    } catch (error) {
      console.error('❌ AORP: Fallo crítico al cargar libtaior WASM.', error);
      throw new Error(
        'CRITICAL: No se puede inicializar sin libtaior WASM. ' +
        'AORP requiere libtaior para cifrado onion y routing anónimo. ' +
        'Sin libtaior, NO hay privacidad real. ' +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async generateKeyPair(): Promise<void> {
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      ['deriveKey', 'deriveBits']
    );
    console.log('🔑 AORP: Claves de identidad generadas (P-256)');
  }

  private async discoverNodes(peerIds: string[]): Promise<void> {
    for (const peerId of peerIds) {
      if (peerId !== this.config.peerId && !this.knownNodes.has(peerId)) {
        this.knownNodes.set(peerId, {
          id: peerId,
          address: `peer://${peerId}`,
          publicKey: new Uint8Array(0),
          lastSeen: Date.now()
        });
        this.pendingHandshakes.add(peerId);

        await this.createPeerConnection(peerId, false);
      }
    }
  }

  private async buildInitialCircuits(): Promise<void> {
    await this.waitForHandshakes();

    const nodeIds = Array.from(this.knownNodes.keys());

    if (nodeIds.length < this.minHops) {
      console.warn(`Solo ${nodeIds.length} nodos disponibles, se requieren ${this.minHops} para anonimato`);
      return;
    }

    const circuit = await this.buildCircuit(this.minHops);
    if (circuit) {
      this.circuits.set(circuit.id.toString(), circuit);
      console.log(`🔐 AORP: Circuito creado con ${circuit.nodes.length} hops`);
    }

    setInterval(() => this.refreshCircuits(), this.circuitRefreshInterval);
  }

  private async waitForHandshakes(): Promise<void> {
    const startTime = Date.now();

    while (this.pendingHandshakes.size > 0 && Date.now() - startTime < this.handshakeTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.pendingHandshakes.size > 0) {
      console.warn(`⚠️ AORP: ${this.pendingHandshakes.size} handshakes no completados tras timeout`);
      for (const peerId of this.pendingHandshakes) {
        this.knownNodes.delete(peerId);
      }
      this.pendingHandshakes.clear();
    }
  }

  private async buildCircuit(targetHops: number): Promise<Circuit | null> {
    const isInvalidKey = (k: Uint8Array) => !k || k.length === 0 || (k.length === 32 && k.every(b => b === 0));
    const availableNodes = Array.from(this.knownNodes.values())
      .filter(node => Date.now() - node.lastSeen < 60000 && !isInvalidKey(node.publicKey));

    if (availableNodes.length < targetHops) {
      return null;
    }

    const selectedNodes: AORPNode[] = [];
    const usedIds = new Set<string>();

    for (let i = 0; i < targetHops; i++) {
      const candidates = availableNodes.filter(n => !usedIds.has(n.id));

      if (candidates.length === 0) break;

      let selected: AORPNode;

      if (this.taiorWasm && this.taiorWasm.decideNextHop) {
        const candidateIds = candidates.map(c => c.id);
        const nextHopId = this.taiorWasm.decideNextHop(candidateIds, targetHops - i);
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

    channel.onopen = async () => {
      const node = this.knownNodes.get(peerId);
      if (node) {
        node.lastSeen = Date.now();
      }
      // Send Handshake with our Public Key
      await this.sendHandshake(channel);
    };

    channel.onmessage = async (event) => {
      const data = new Uint8Array(event.data);
      if (data[0] === 0xBB) {
        await this.handleHandshake(data, peerId);
      } else {
        this.handleOnionPacket(data, peerId);
      }
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
    if (!this.taiorWasm) {
      throw new Error(
        'CRITICAL: libtaior no inicializado. ' +
        'No se puede enviar datos sin protección AORP.'
      );
    }

    const circuit = Array.from(this.circuits.values())[0];
    if (!circuit) {
      throw new Error('No hay circuitos disponibles para routing');
    }

    try {
      const mode = circuit.nodes.length >= 4 ? 'mix' : 'fast';
      const encryptedPacket = await this.taiorWasm.send(data, mode);
      
      if (!encryptedPacket || encryptedPacket.length === 0) {
        throw new Error('libtaior.send() retornó paquete vacío');
      }

      await this.sendToNextHop(encryptedPacket, circuit.nodes[0].id);
    } catch (error) {
      throw new Error(
        'CRITICAL: Fallo en cifrado AORP. Mensaje NO enviado por seguridad. ' +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private buildAORPPacket(_payload: Uint8Array, _circuit: Circuit): Uint8Array {
    throw new Error(
      'CRITICAL: buildAORPPacket() is deprecated and MUST NOT be used. ' +
      'libtaior WASM handles packet formatting internally.'
    );
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

  private async encryptOnion(_data: Uint8Array, _circuit: Circuit): Promise<Uint8Array> {
    throw new Error(
      'CRITICAL: encryptOnion() is deprecated and MUST NOT be used. ' +
      'libtaior WASM implements onion encryption internally.'
    );
  }

  private async encryptLayer(_data: Uint8Array, _node: AORPNode): Promise<Uint8Array> {
    throw new Error(
      'CRITICAL: encryptLayer() is deprecated and MUST NOT be used. ' +
      'libtaior WASM uses ChaCha20-Poly1305 for onion layer encryption.'
    );
  }

  private async handleOnionPacket(data: Uint8Array, fromPeerId: string): Promise<void> {
    if (this.isCoverTraffic(data)) {
      return;
    }

    if (this.isForMe(data)) {
      const payload = this.removePadding(data);
      if (this.messageCallback) {
        this.messageCallback(payload, fromPeerId);
      }
      return;
    }

    // Not for us — attempt to forward as relay if next hop is known
    const nextHop = this.extractNextHop(data);
    if (nextHop && this.dataChannels.has(nextHop)) {
      const jitter = Math.random() * 100;
      await new Promise(resolve => setTimeout(resolve, jitter));
      await this.sendToNextHop(data, nextHop);
    }
  }

  private async decryptLayer(_data: Uint8Array): Promise<Uint8Array> {
    throw new Error(
      'CRITICAL: decryptLayer() is deprecated and MUST NOT be used. ' +
      'Onion decryption requires native libtaior implementation.'
    );
  }

  // Handshake Protocol
  private async sendHandshake(channel: RTCDataChannel): Promise<void> {
    if (!this.keyPair || channel.readyState !== 'open') return;

    try {
      const pubKeyRaw = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
      const pubKeyBytes = new Uint8Array(pubKeyRaw);

      const packet = new Uint8Array(1 + pubKeyBytes.length);
      packet[0] = 0xBB; // Magic for Handshake
      packet.set(pubKeyBytes, 1);

      channel.send(packet);
      console.log('🤝 AORP: Public Key Handshake enviado');
    } catch (e) {
      console.error('Error enviando handshake:', e);
    }
  }

  private async handleHandshake(data: Uint8Array, peerId: string): Promise<void> {
    try {
      const keyBytes = data.slice(1);

      if (keyBytes.length < 32) {
        console.error(`❌ AORP: Handshake inválido de ${peerId}: clave muy corta (${keyBytes.length} bytes)`);
        return;
      }

      const node = this.knownNodes.get(peerId);
      if (node) {
        node.publicKey = keyBytes;
        node.cryptoKey = undefined;
        node.lastSeen = Date.now();
        this.pendingHandshakes.delete(peerId);
        console.log(`✅ AORP: Handshake completado con ${peerId} (${keyBytes.length} bytes)`);

        if (this.circuits.size === 0 && this.pendingHandshakes.size === 0) {
          await this.refreshCircuits();
        }
      } else {
        this.knownNodes.set(peerId, {
          id: peerId,
          address: `peer://${peerId}`,
          publicKey: keyBytes,
          lastSeen: Date.now()
        });
        console.log(`✅ AORP: Nuevo nodo descubierto via handshake: ${peerId}`);
      }
    } catch (e) {
      console.error('Error procesando handshake:', e);
    }
  }

  private isForMe(data: Uint8Array): boolean {
    // AORP packet format:
    // [1 byte: magic 0xAA] [1 byte: flags] [16 bytes: destination] [remaining: payload]
    if (data.length < 18) {
      return false; // Invalid packet
    }

    // Check magic byte
    if (data[0] !== 0xAA) {
      return false;
    }

    // Extract destination (bytes 2-17)
    const destination = data.slice(2, 18);

    // Check if destination matches our peerId hash
    const ourIdHash = new TextEncoder().encode(this.config.peerId);
    const ourIdHashSlice = ourIdHash.slice(0, 16);

    // Compare destination with our ID
    for (let i = 0; i < 16; i++) {
      if (destination[i] !== ourIdHashSlice[i % ourIdHashSlice.length]) {
        return false;
      }
    }

    return true;
  }

  private isCoverTraffic(data: Uint8Array): boolean {
    return data[0] === 0xFF;
  }

  private removePadding(data: Uint8Array): Uint8Array {
    // AORP packet with payload length:
    // [1 byte: magic] [1 byte: flags] [16 bytes: destination] [2 bytes: payload length] [payload] [padding]
    if (data.length < 20) {
      return data; // Too short, return as-is
    }

    // Extract payload length (bytes 18-19, big-endian)
    const payloadLength = (data[18] << 8) | data[19];

    if (payloadLength === 0 || payloadLength > data.length - 20) {
      // Invalid length, return everything after header
      return data.slice(20);
    }

    // Extract actual payload (skip header + length field)
    return data.slice(20, 20 + payloadLength);
  }

  private extractNextHop(data: Uint8Array): string | null {
    // After decryption, the packet should have routing info
    // Format: [1 byte: magic] [1 byte: flags] [16 bytes: destination] [32 bytes: next hop] [payload]
    if (data.length < 50) {
      return null; // Not enough data for routing header
    }

    // Check if this is a routing packet (not final destination)
    const flags = data[1];
    const hasNextHop = (flags & 0x01) !== 0;

    if (!hasNextHop) {
      return null; // This is the final hop
    }

    // Extract next hop (bytes 18-49)
    const nextHopBytes = data.slice(18, 50);
    const nextHopId = new TextDecoder().decode(nextHopBytes).replace(/\0/g, '').trim();

    if (nextHopId.length === 0) {
      return null;
    }

    return nextHopId;
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
    if (!circuit || !this.taiorWasm) return;

    const size = 512 + Math.floor(Math.random() * 1536);
    const coverData = new Uint8Array(size);
    coverData[0] = 0xFF;
    crypto.getRandomValues(coverData.subarray(1));

    try {
      const encryptedCover = await this.taiorWasm.send(coverData, 'fast');
      await this.sendToNextHop(encryptedCover, circuit.nodes[0].id);
      this.lastCoverSent = Date.now();
    } catch (error) {
      // Cover traffic failures are non-fatal but should be logged
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
    
    if (this.dht) {
      this.dht.destroy();
    }
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
