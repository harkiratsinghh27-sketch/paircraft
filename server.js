const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/health' || req.url === '/') {
    const roomCount = rooms.size;
    let peerCount = 0;
    rooms.forEach(peers => {
      peerCount += peers.size;
    });

    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'PairCraft WebRTC Signaling Server',
      activeRooms: roomCount,
      activePeers: peerCount,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({ server });

// Map<roomId, Set<{ ws, peerId, userName }>>
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentPeerId = null;
  let currentUserName = 'Anonymous';

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      const { type, roomId, peerId, payload, userName } = data;

      switch (type) {
        case 'join-room': {
          currentRoom = roomId;
          currentPeerId = peerId;
          currentUserName = userName || `Peer-${peerId.slice(0, 4)}`;

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
          }

          const roomPeers = rooms.get(roomId);
          const existingPeers = Array.from(roomPeers).map(p => ({
            peerId: p.peerId,
            userName: p.userName
          }));

          // Add this peer
          roomPeers.add({ ws, peerId, userName: currentUserName });

          // Inform this peer about who is already here
          ws.send(JSON.stringify({
            type: 'room-joined',
            peerId: currentPeerId,
            peers: existingPeers,
            isInitiator: existingPeers.length === 0
          }));

          // Notify existing peers about the new joiner
          roomPeers.forEach(peer => {
            if (peer.peerId !== currentPeerId && peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(JSON.stringify({
                type: 'peer-joined',
                peerId: currentPeerId,
                userName: currentUserName
              }));
            }
          });

          console.log(`[Room: ${roomId}] Peer joined: ${currentUserName} (${currentPeerId}). Room size: ${roomPeers.size}`);
          break;
        }

        case 'webrtc-offer':
        case 'webrtc-answer':
        case 'ice-candidate':
        case 'code-sync':
        case 'cursor-sync':
        case 'language-change':
        case 'chat-message':
        case 'ping': {
          if (!currentRoom || !rooms.has(currentRoom)) return;
          const targetPeerId = data.targetPeerId;
          const roomPeers = rooms.get(currentRoom);

          if (type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }));
            return;
          }

          roomPeers.forEach(peer => {
            const isMatch = targetPeerId ? peer.peerId === targetPeerId : peer.peerId !== currentPeerId;
            if (isMatch && peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(JSON.stringify({
                type,
                senderPeerId: currentPeerId,
                senderUserName: currentUserName,
                payload,
                timestamp: Date.now()
              }));
            }
          });
          break;
        }

        default:
          console.warn(`Unknown message type: ${type}`);
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  const handleDisconnect = () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const roomPeers = rooms.get(currentRoom);
      let removed = null;
      for (const p of roomPeers) {
        if (p.peerId === currentPeerId) {
          removed = p;
          roomPeers.delete(p);
          break;
        }
      }

      if (roomPeers.size === 0) {
        rooms.delete(currentRoom);
        console.log(`[Room: ${currentRoom}] Empty room deleted.`);
      } else {
        roomPeers.forEach(peer => {
          if (peer.ws.readyState === WebSocket.OPEN) {
            peer.ws.send(JSON.stringify({
              type: 'peer-left',
              peerId: currentPeerId,
              userName: currentUserName
            }));
          }
        });
        console.log(`[Room: ${currentRoom}] Peer left: ${currentUserName}. Remaining: ${roomPeers.size}`);
      }
    }
  };

  ws.on('close', handleDisconnect);
  ws.on('error', handleDisconnect);
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 PairCraft WebRTC Signaling Server listening on :${PORT}`);
  console.log(`   Healthcheck: http://localhost:${PORT}/health`);
  console.log(`   WebSocket:   ws://localhost:${PORT}`);
  console.log(`=======================================================`);
});
