// ✅ server.js — Pure WebSocket Server for Battle Mode
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 4000;
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

// Store player info per challenge ID
const lobbies = new Map(); // cid => { players: Map<username, { ready: boolean, socket, running: boolean, testsPassed: number, submitted: boolean, submittedResults: number }> }

wss.on('connection', (ws) => {
  console.log('🔗 New WebSocket connection established !!!!');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const { type, cid, username } = data;

      if (!cid || !username) return;

      if (!lobbies.has(cid)) {
        lobbies.set(cid, { players: new Map() });
        console.log(`🏠 Created new lobby: ${cid}`);
      }

      const lobby = lobbies.get(cid);

      // Ensure the player is tracked
      if (!lobby.players.has(username)) {
        lobby.players.set(username, { ready: false, socket: ws, running: false, testsPassed: 0, submitted: false, submittedResults: 0 });
      }

      switch (type) {
        case 'join':
          console.log(`👤 User "${username}" joined lobby: ${cid}`);
          console.log(`📊 Lobby ${cid} now has ${lobby.players.size} player(s)`);

          // Send current lobby state to the joining player
          const currentPlayers = Array.from(lobby.players.entries()).map(([playerName, playerData]) => ({
            username: playerName,
            cid,
            ready: playerData.ready,
            running: playerData.running || false,
            testsPassed: playerData.testsPassed || 0,
            submitted: playerData.submitted || false,
            submittedResults: playerData.submittedResults || 0
          }));

          // Send lobby state to the new player
          ws.send(JSON.stringify({
            type: 'lobbyState',
            players: currentPlayers
          }));

          // Broadcast to others that a new player joined
          broadcast(cid, {
            type: 'playerJoined',
            player: { username, cid, ready: false, running: false, testsPassed: 0, submitted: false, submittedResults: 0 }
          }, ws); // Exclude the joining player from broadcast
          break;

        case 'ready': {
          const player = lobby.players.get(username);
          if (player) {
            // Toggle ready state
            player.ready = !player.ready;

            console.log(`${player.ready ? '✅' : '❌'} User "${username}" is ${player.ready ? 'ready' : 'not ready'} in lobby: ${cid}`);

            // Count ready players
            const readyCount = Array.from(lobby.players.values()).filter(p => p.ready).length;
            console.log(`🎯 Ready players in ${cid}: ${readyCount}/${lobby.players.size}`);

            // Broadcast updated ready state
            broadcast(cid, {
              type: 'playerReadyToggle',
              player: { username, cid, ready: player.ready, running: player.running || false, testsPassed: player.testsPassed || 0, submitted: player.submitted || false, submittedResults: player.submittedResults || 0 }
            });

            // ✅ Check if all players are now ready
            const allReady = lobby.players.size > 0 &&
              Array.from(lobby.players.values()).every(p => p.ready);

            if (allReady && !lobby.started) {
              lobby.started = true; // prevent re-triggering
              console.log(`🚀 All players ready in ${cid}. Starting challenge...`);
              startChallengeInBackend(cid);
            }
          }
          break;
        }

        case 'codeRunning': {
          const player = lobby.players.get(username);
          if (player) {
            player.running = true;
            console.log(`🏃 User "${username}" started running code in lobby: ${cid}`);

            // Broadcast that this player is running code
            broadcast(cid, {
              type: 'playerCodeRunning',
              player: { username, cid, running: true }
            });
          }
          break;
        }

        case 'codeFinished': {
          const player = lobby.players.get(username);
          if (player) {
            player.running = false;
            console.log(`✅ User "${username}" finished running code in lobby: ${cid}`);

            // Broadcast that this player finished running code
            broadcast(cid, {
              type: 'playerCodeFinished',
              player: { username, cid, running: false }
            });
          }
          break;
        }

        case 'testResults': {
          const player = lobby.players.get(username);
          if (player && data.testsPassed !== undefined) {
            player.testsPassed = data.testsPassed;
            console.log(`📊 User "${username}" passed ${data.testsPassed} tests in lobby: ${cid}`);

            // Broadcast test results
            broadcast(cid, {
              type: 'playerTestResults',
              player: { username, cid, testsPassed: data.testsPassed }
            });
          }
          break;
        }

        case 'codeSubmitted': {
          const player = lobby.players.get(username);
          if (player && data.submittedResults !== undefined) {
            player.submitted = true;
            player.submittedResults = data.submittedResults;
            console.log(`🎯 User "${username}" submitted code with ${data.submittedResults} tests passed in lobby: ${cid}`);

            // Broadcast that this player submitted with results
            broadcast(cid, {
              type: 'playerCodeSubmitted',
              player: { username, cid, submitted: true, submittedResults: data.submittedResults }
            });
          }
          break;
        }

        default:
          console.warn('⚠️ Unknown message type:', type);
      }
    } catch (err) {
      console.error('❌ Failed to process message:', err);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');

    // Find and remove disconnected player from lobbies
    for (const [cid, lobby] of lobbies.entries()) {
      for (const [username, player] of lobby.players.entries()) {
        if (player.socket === ws) {
          lobby.players.delete(username);
          console.log(`👋 User "${username}" disconnected from lobby: ${cid}`);
          console.log(`📊 Lobby ${cid} now has ${lobby.players.size} player(s)`);

          // Clean up empty lobbies
          if (lobby.players.size === 0) {
            lobbies.delete(cid);
            console.log(`🗑️ Empty lobby ${cid} removed`);
          } else {
            // Notify remaining players
            broadcast(cid, {
              type: 'playerLeft',
              player: { username, cid }
            });
          }
          return;
        }
      }
    }
  });
});

function broadcast(cid, message, excludeSocket = null) {
  const lobby = lobbies.get(cid);
  if (!lobby) return;

  let sentCount = 0;
  for (const { socket } of lobby.players.values()) {
    if (socket.readyState === socket.OPEN && socket !== excludeSocket) {
      socket.send(JSON.stringify(message));
      sentCount++;
    }
  }

  console.log(`📢 Broadcasted "${message.type}" to ${sentCount} player(s) in lobby: ${cid}`);
}

httpServer.listen(PORT, () => {
  console.log(`🚀 WebSocket server running at wss://meetcode-socket-713cca73cbd1.herokuapp.com:${PORT}`);
  console.log(`📋 Active lobbies: ${lobbies.size}`);
});


async function startChallengeInBackend(cid) {
  try {
    const BACKEND_URL = 'https://meetcode-backend.onrender.com/graphql';
    console.log(`🌐 Making GraphQL request to: ${BACKEND_URL}`);
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation {
            startChallenge(cid: "${cid}") {
              cid
              pid
              status
              startDate
              endDate
              participants {
                username
                cid
                rank
                score
                time
              }
            }
          }
        `
      })
    });

    const json = await res.json();
    console.log(`✅ Challenge started for ${cid}:`, json.data?.startChallenge);

    broadcast(cid, {
      type: 'challengeStarted',
      data: json.data?.startChallenge
    });

  } catch (err) {
    console.error(`❌ Failed to start challenge for ${cid}:`, err);
  }
}