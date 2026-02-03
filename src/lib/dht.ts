import { writable, type Readable } from 'svelte/store';

export interface DHTNode {
  id: string;
  address: string;
  lastSeen: number;
  distance?: number;
}

export interface DHTConfig {
  nodeId: string;
  k: number;
  alpha: number;
  refreshInterval: number;
}

export class SimpleDHT {
  private config: DHTConfig;
  private routingTable: Map<string, DHTNode> = new Map();
  private bootstrapNodes: string[] = [];
  private nodeStore = writable<DHTNode[]>([]);
  private refreshTimer: number | null = null;

  constructor(config: Partial<DHTConfig> = {}) {
    this.config = {
      nodeId: config.nodeId || this.generateNodeId(),
      k: config.k || 20,
      alpha: config.alpha || 3,
      refreshInterval: config.refreshInterval || 60000
    };
  }

  private generateNodeId(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private xorDistance(id1: string, id2: string): number {
    let distance = 0;
    const len = Math.min(id1.length, id2.length);
    
    for (let i = 0; i < len; i += 2) {
      const byte1 = parseInt(id1.slice(i, i + 2), 16) || 0;
      const byte2 = parseInt(id2.slice(i, i + 2), 16) || 0;
      distance += byte1 ^ byte2;
    }
    
    return distance;
  }

  addBootstrapNode(address: string): void {
    this.bootstrapNodes.push(address);
  }

  async bootstrap(): Promise<void> {
    console.log(`🔍 DHT: Iniciando bootstrap con ${this.bootstrapNodes.length} nodos`);
    
    for (const address of this.bootstrapNodes) {
      const nodeId = this.generateNodeId();
      this.addNode({
        id: nodeId,
        address,
        lastSeen: Date.now()
      });
    }

    this.startRefreshLoop();
  }

  addNode(node: DHTNode): void {
    const distance = this.xorDistance(this.config.nodeId, node.id);
    
    const nodeWithDistance: DHTNode = {
      ...node,
      distance,
      lastSeen: Date.now()
    };

    this.routingTable.set(node.id, nodeWithDistance);
    
    if (this.routingTable.size > this.config.k) {
      this.evictFarthestNode();
    }

    this.updateStore();
  }

  private evictFarthestNode(): void {
    let farthestNode: DHTNode | null = null;
    let maxDistance = -1;

    for (const node of this.routingTable.values()) {
      if ((node.distance ?? 0) > maxDistance) {
        maxDistance = node.distance ?? 0;
        farthestNode = node;
      }
    }

    if (farthestNode) {
      this.routingTable.delete(farthestNode.id);
    }
  }

  findClosestNodes(targetId: string, count: number = 3): DHTNode[] {
    const nodesWithDistance = Array.from(this.routingTable.values())
      .map(node => ({
        ...node,
        distance: this.xorDistance(targetId, node.id)
      }))
      .sort((a, b) => a.distance - b.distance);

    return nodesWithDistance.slice(0, count);
  }

  getRandomNodes(count: number): DHTNode[] {
    const nodes = Array.from(this.routingTable.values());
    const shuffled = nodes.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  getAllNodes(): DHTNode[] {
    return Array.from(this.routingTable.values());
  }

  getNodeCount(): number {
    return this.routingTable.size;
  }

  get nodes(): Readable<DHTNode[]> {
    return this.nodeStore;
  }

  private updateStore(): void {
    this.nodeStore.set(Array.from(this.routingTable.values()));
  }

  private startRefreshLoop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = window.setInterval(() => {
      this.refreshRoutingTable();
    }, this.config.refreshInterval);
  }

  private refreshRoutingTable(): void {
    const now = Date.now();
    const staleThreshold = this.config.refreshInterval * 2;

    for (const [id, node] of this.routingTable.entries()) {
      if (now - node.lastSeen > staleThreshold) {
        this.routingTable.delete(id);
      }
    }

    this.updateStore();
    
    console.log(`🔄 DHT: Tabla de routing actualizada. ${this.routingTable.size} nodos activos`);
  }

  updateNodeSeen(nodeId: string): void {
    const node = this.routingTable.get(nodeId);
    if (node) {
      node.lastSeen = Date.now();
      this.routingTable.set(nodeId, node);
      this.updateStore();
    }
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.routingTable.clear();
    this.updateStore();
  }
}
