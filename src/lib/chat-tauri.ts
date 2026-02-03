import { writable, type Readable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { createTauriTaiorClient, type TaiorRouteMode } from './tauri-taior';
import { QuicTransport, DEFAULT_RELAYS } from './quic-transport';
import { TaiorProvider } from './yjs-taior-provider';
import { CryptoStorage } from './crypto-storage';

export type ChatMessage = {
  id: string;
  roomKey: string;
  senderId: string;
  alias: string;
  text: string;
  timestamp: number;
  reinforced: boolean;
  status?: 'sent' | 'delivered' | 'seen';
};

export type ChatSession = {
  messages: Readable<ChatMessage[]>;
  connected: Readable<boolean>;
  relayStatus: Readable<string>;
  sendMessage: (text: string, reinforced: boolean) => Promise<void>;
  disconnect: () => void;
};

const makePersistKey = (roomKey: string) => `hush-history-${roomKey}`;

export const generateRoomKey = () =>
  Array.from({ length: 10 }, () => Math.random().toString(36)[2])
    .join('')
    .toUpperCase();

export async function createTauriSession(
  roomKey: string, 
  alias: string, 
  hushId: string
): Promise<ChatSession> {
  const ydoc = new Y.Doc();
  const yMessages = ydoc.getArray<ChatMessage>('messages');
  const messages = writable<ChatMessage[]>([]);
  const connected = writable(false);
  const relayStatus = writable('Disconnected');
  const cryptoStorage = new CryptoStorage();

  const taior = await createTauriTaiorClient({
    bootstrap_nodes: DEFAULT_RELAYS.map(r => `${r.address}:${r.port}`)
  });

  await taior.enableCoverTraffic(true, 0.3);

  const quicTransport = new QuicTransport();
  
  try {
    const relay = DEFAULT_RELAYS[0];
    await quicTransport.connectToRelay(relay);
    relayStatus.set(`Connected to ${relay.address}`);
    connected.set(true);
  } catch (err) {
    console.error('Failed to connect to relay:', err);
    relayStatus.set('Connection failed');
  }

  const customTransport = {
    send: async (data: Uint8Array): Promise<void> => {
      const mode: TaiorRouteMode = 'mix';
      const encrypted = await taior.send(data, mode);
      await quicTransport.send(encrypted);
    },
    onMessage: (callback: (data: Uint8Array, peerId: string) => void): void => {
      quicTransport.setupMessageListener((data) => {
        callback(data, 'relay');
      });
    },
    connect: async (): Promise<void> => {
      console.log('QUIC transport connected');
    },
    disconnect: (): void => {
      quicTransport.disconnect();
      quicTransport.cleanup();
    },
    isConnected: (): boolean => true,
    getPeers: (): string[] => ['relay-node']
  };

  const provider = new TaiorProvider(ydoc, roomKey, customTransport);

  const persistKey = makePersistKey(roomKey);

  const loadLocal = async () => {
    if (typeof localStorage === 'undefined') return;
    try {
      const parsed = await cryptoStorage.loadEncrypted<ChatMessage[]>(persistKey, roomKey);
      if (parsed && yMessages.length === 0 && parsed.length > 0) {
        yMessages.push(parsed);
      }
    } catch (err) {
      console.warn('Failed to load encrypted history', err);
    }
  };

  await loadLocal();

  const persist = async (items: ChatMessage[]) => {
    if (typeof localStorage === 'undefined') return;
    try {
      await cryptoStorage.saveEncrypted(persistKey, items.slice(-200), roomKey);
    } catch (err) {
      console.warn('Failed to persist encrypted history', err);
    }
  };

  const updateMessages = () => {
    const current = yMessages.toArray().sort((a, b) => a.timestamp - b.timestamp);
    messages.set(current);
    persist(current);
  };

  yMessages.observeDeep(updateMessages);
  updateMessages();

  await provider.connect();

  const sendMessage = async (text: string, reinforced: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const msg: ChatMessage = {
      id: uuidv4(),
      roomKey,
      senderId: hushId,
      alias: alias || 'anon',
      text: trimmed,
      timestamp: Date.now(),
      reinforced,
      status: 'sent'
    };
    
    yMessages.push([msg]);
  };

  const disconnect = () => {
    provider.disconnect();
    customTransport.disconnect();
    taior.disconnect();
    ydoc.destroy();
    connected.set(false);
    relayStatus.set('Disconnected');
  };

  return { messages, connected, relayStatus, sendMessage, disconnect };
}
