import { writable, type Readable } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { createTaiorClient, type TaiorRouteMode } from './taior';
import { BroadcastChannelTransport } from './broadcast-transport';
import { WebRTCTransport } from './webrtc-transport';
import { TaiorProvider } from './yjs-taior-provider';
import { CryptoStorage } from './crypto-storage';
import type { Transport } from './transport';

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
  sendMessage: (text: string, reinforced: boolean) => Promise<void>;
  disconnect: () => void;
};

const makePersistKey = (roomKey: string) => `hush-history-${roomKey}`;

export const generateRoomKey = () =>
  Array.from({ length: 10 }, () => Math.random().toString(36)[2])
    .join('')
    .toUpperCase();

export async function createSession(roomKey: string, alias: string, hushId: string): Promise<ChatSession> {
  const ydoc = new Y.Doc();
  const yMessages = ydoc.getArray<ChatMessage>('messages');
  const messages = writable<ChatMessage[]>([]);
  const connected = writable(false);
  const isProd = import.meta.env.PROD;
  const taior = await createTaiorClient();
  const peerId = uuidv4();
  const signalingServer = import.meta.env.VITE_SIGNALING_URL || 'wss://hush-signal.railway.app';
  const cryptoStorage = new CryptoStorage();

  taior.enableCoverTraffic(true, 0.3);

  const transport: Transport = isProd
    ? new WebRTCTransport({
        roomKey,
        peerId,
        signalingServer,
        turnServers: [
          {
            urls: 'turn:relay.hush.network:3478',
            username: 'hush',
            credential: 'anonymous'
          }
        ]
      })
    : new BroadcastChannelTransport({
        roomKey,
        peerId
      });
  
  const provider = new TaiorProvider(ydoc, roomKey, transport);

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
  connected.set(true);

  const sendMessage = async (text: string, reinforced: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const mode: TaiorRouteMode = reinforced ? 'mix' : 'adaptive';
    const encoded = new TextEncoder().encode(trimmed);
    const routed = await taior.send(encoded, mode);
    const routedText = new TextDecoder().decode(routed);
    const msg: ChatMessage = {
      id: uuidv4(),
      roomKey,
      senderId: hushId,
      alias: alias || 'anon',
      text: routedText,
      timestamp: Date.now(),
      reinforced,
      status: 'sent'
    };
    yMessages.push([msg]);
  };

  const disconnect = () => {
    provider.disconnect();
    ydoc.destroy();
  };

  return { messages, connected, sendMessage, disconnect };
}
