import { WebSocketServer, WebSocket } from 'ws';

interface Room {
  peers: Map<string, WebSocket>;
}

const rooms = new Map<string, Room>();

function getOrCreateRoom(roomKey: string): Room {
  if (!rooms.has(roomKey)) {
    rooms.set(roomKey, { peers: new Map() });
  }
  return rooms.get(roomKey)!;
}

export function createSignalingServer(port = 8080) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket) => {
    let currentRoom: string | null = null;
    let peerId: string | null = null;

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'join':
            currentRoom = msg.roomKey;
            peerId = msg.from;
            const room = getOrCreateRoom(currentRoom);
            room.peers.set(peerId, ws);

            const peerList = Array.from(room.peers.keys()).filter((id) => id !== peerId);
            ws.send(
              JSON.stringify({
                type: 'peer-list',
                data: { peers: peerList }
              })
            );

            for (const [id, peer] of room.peers.entries()) {
              if (id !== peerId) {
                peer.send(
                  JSON.stringify({
                    type: 'peer-list',
                    data: { peers: [peerId] }
                  })
                );
              }
            }
            break;

          case 'offer':
          case 'answer':
          case 'ice-candidate':
            if (currentRoom && msg.to) {
              const room = rooms.get(currentRoom);
              const targetPeer = room?.peers.get(msg.to);
              if (targetPeer && targetPeer.readyState === WebSocket.OPEN) {
                targetPeer.send(data.toString());
              }
            }
            break;
        }
      } catch (err) {
        console.error('Error handling message:', err);
      }
    });

    ws.on('close', () => {
      if (currentRoom && peerId) {
        const room = rooms.get(currentRoom);
        if (room) {
          room.peers.delete(peerId);
          if (room.peers.size === 0) {
            rooms.delete(currentRoom);
          }
        }
      }
    });
  });

  console.log(`🔌 Signaling server running on ws://localhost:${port}`);
  return wss;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createSignalingServer();
}
