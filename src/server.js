import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 4000;
const BACKEND_URL = "http://localhost:8081/graphql";
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

const lobbies = new Map();

const CHALLENGE_DURATION = 15 * 60 * 1000;

wss.on('connection', (ws) => {
  console.log('🔗 New WebSocket connection established !!!!');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const { type, cid, username } = data;

      if (!cid || !username) return;

      if (type === 'join') {
        const challengeValid = await validateChallengeAccess(cid, username);
        if (!challengeValid.canJoin) {
          ws.send(JSON.stringify({
            type: 'joinError',
            message: challengeValid.reason
          }));
          return;
        }
      }

      if (!lobbies.has(cid)) {
        lobbies.set(cid, { 
          players: new Map(),
          completedPlayers: new Map(), // Store players who finished early
          disconnectedPlayers: new Map(), // Store temporarily disconnected players with timers
          timer: null,
          status: 'WAITING',
          challengeEnded: false,
          inactivityTimer: null // 3-min inactivity timer
        });
        console.log(`🏠 Created new lobby: ${cid}`);
        // Start inactivity timer
        resetLobbyInactivityTimer(cid);
      }

      const lobby = lobbies.get(cid);

      // Don't allow joining if challenge has ended
      if (lobby.challengeEnded && type === 'join') {
        ws.send(JSON.stringify({
          type: 'joinError',
          message: 'Challenge has already ended'
        }));
        return;
      }

      // Check if player is reconnecting (was temporarily disconnected)
      if (lobby.disconnectedPlayers.has(username)) {
        console.log(`🔄 Player "${username}" reconnecting to lobby: ${cid}`);
        const disconnectedPlayer = lobby.disconnectedPlayers.get(username);
        
        // Cancel the disconnect timer
        if (disconnectedPlayer.disconnectTimer) {
          clearTimeout(disconnectedPlayer.disconnectTimer);
          console.log(`⏰ Cancelled disconnect timer for "${username}"`);
        }
        
        // Restore the player with their previous data but new socket
        disconnectedPlayer.playerData.socket = ws;
        lobby.players.set(username, disconnectedPlayer.playerData);
        lobby.disconnectedPlayers.delete(username);
        
        // Notify others that player reconnected
        broadcast(cid, {
          type: 'playerReconnected',
          player: { username, cid }
        }, ws);
        
        console.log(`✅ Player "${username}" successfully reconnected to lobby: ${cid}`);
      } else {
        // Ensure the player is tracked (new player)
        if (!lobby.players.has(username)) {
          lobby.players.set(username, { 
            ready: false, 
            socket: ws, 
            running: false, 
            testsPassed: 0, 
            submitted: false, 
            submittedResults: 0,
            submittedTestsPassed: 0, // Number of tests passed on submission
            latestScore: 0
          });
        } else {
          lobby.players.get(username).socket = ws;
        }
      }

      // Reset inactivity timer
      resetLobbyInactivityTimer(cid);

      switch (type) {
        case 'join':
          console.log(`👤 User "${username}" joined lobby: ${cid}`);
          console.log(`📊 Lobby ${cid} now has ${lobby.players.size} player(s)`);

          const currentPlayers = Array.from(lobby.players.entries()).map(([playerName, playerData]) => ({
            username: playerName,
            cid,
            ready: playerData.ready,
            running: playerData.running || false,
            testsPassed: playerData.testsPassed || 0,
            submitted: playerData.submitted || false,
            submittedResults: playerData.submittedResults || 0,
            submittedTestsPassed: playerData.submittedTestsPassed || 0
          }));

          // Always provide timer info if challenge is in progress, even if timer object is temporarily null
          let timerInfo = null;
          if (lobby.timer) {
            timerInfo = {
              startTime: lobby.timer.startTime,
              endTime: lobby.timer.endTime,
              remainingTime: Math.max(0, lobby.timer.endTime - Date.now())
            };
          } else if (lobby.status === 'IN_PROGRESS') {
            // Challenge is in progress but timer object not set yet (race condition)
            // Provide minimal timer info to indicate challenge is active
            const now = Date.now();
            timerInfo = {
              startTime: now,
              endTime: now + CHALLENGE_DURATION,
              remainingTime: CHALLENGE_DURATION,
              isEstimated: true // Flag to indicate this is estimated
            };
          }

          ws.send(JSON.stringify({
            type: 'lobbyState',
            players: currentPlayers,
            status: lobby.status,
            timer: timerInfo
          }));

          broadcast(cid, {
            type: 'playerJoined',
            player: { username, cid, ready: false, running: false, testsPassed: 0, submitted: false, submittedResults: 0 }
          }, ws);
          break;

        case 'ready': {
          const player = lobby.players.get(username);
          if (player && lobby.status === 'WAITING') {
            player.ready = !player.ready;

            console.log(`${player.ready ? '✅' : '❌'} User "${username}" is ${player.ready ? 'ready' : 'not ready'} in lobby: ${cid}`);

            const readyCount = Array.from(lobby.players.values()).filter(p => p.ready).length;
            console.log(`🎯 Ready players in ${cid}: ${readyCount}/${lobby.players.size}`);

            broadcast(cid, {
              type: 'playerReadyToggle',
              player: { username, cid, ready: player.ready, running: player.running || false, testsPassed: player.testsPassed || 0, submitted: player.submitted || false, submittedResults: player.submittedResults || 0 }
            });

            const allReady = lobby.players.size > 0 && Array.from(lobby.players.values()).every(p => p.ready);

            if (allReady && !lobby.started) {
              lobby.started = true;
              console.log(`🚀 All players ready in ${cid}. Starting challenge...`);
              await startChallengeInBackend(cid);
              startChallengeTimer(cid);
            }
          }
          break;
        }

        case 'codeRunning': {
          const player = lobby.players.get(username);
          if (player) {
            player.running = true;
            console.log(`🏃 User "${username}" started running code in lobby: ${cid}`);

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
            player.latestScore = data.testsPassed; // Update latest score
            console.log(`📊 User "${username}" passed ${data.testsPassed} tests in lobby: ${cid}`);

            broadcast(cid, {
              type: 'playerTestResults',
              player: { username, cid, testsPassed: data.testsPassed }
            });
          }
          break;
        }

        case 'codeSubmitted': {
          const player = lobby.players.get(username);
          if (player && data.submittedResults !== undefined && data.testsPassed !== undefined) {
            player.submitted = true;
            player.submittedResults = data.submittedResults; // Actual calculated score
            player.submittedTestsPassed = data.testsPassed; // Number of tests passed
            player.latestScore = data.submittedResults; // Update latest score with actual score
            console.log(`🎯 User "${username}" submitted code with ${data.testsPassed} tests passed and score ${data.submittedResults} in lobby: ${cid}`);

            broadcast(cid, {
              type: 'playerCodeSubmitted',
              player: {
                username,
                cid,
                submitted: true,
                submittedResults: data.submittedResults,
                submittedTestsPassed: data.testsPassed
              }
            });

            // Check if user passed all tests and wants to end challenge early
            if (data.testsPassed === 12) { // Check number of tests passed, not score
              console.log(`🏆 User "${username}" passed all 12 tests with score ${data.submittedResults}! They can end the challenge early.`);

              // Broadcast option to end challenge
              broadcast(cid, {
                type: 'canEndChallenge',
                player: { username, cid }
              });
            }
          }
          break;
        }

        case 'endChallenge': {
          if (lobby.status === 'IN_PROGRESS' && !lobby.challengeEnded) {
            console.log(`🏁 User "${username}" requested to end challenge: ${cid}`);
            await endChallenge(cid, `Ended by ${username}`);
          }
          break;
        }

        case 'endChallengeForUser': {
          const player = lobby.players.get(username);
          if (lobby.status === 'IN_PROGRESS' && !lobby.challengeEnded && player && player.submittedTestsPassed === 12) {
            console.log(`🏆 User "${username}" completed all tests and is ending their participation in challenge: ${cid}`);

            // Record final score (use the actual calculated score)
            const finalScore = player.submittedResults || 0;
            console.log(`📊 Recording final score for "${username}": ${finalScore} (passed ${player.submittedTestsPassed}/12 tests)`);

            // Broadcast that this user has completed and left
            broadcast(cid, {
              type: 'playerCompletedAndLeft',
              player: {
                username,
                cid,
                finalScore,
                testsPassed: player.submittedTestsPassed,
                reason: 'Completed all test cases'
              }
            }, player.socket);

            // Send confirmation to the user
            player.socket.send(JSON.stringify({
              type: 'challengeEndedForUser',
              message: 'You have successfully completed the challenge!',
              finalScore,
              testsPassed: player.submittedTestsPassed
            }));

            // Store completed player data before removing from active players
            lobby.completedPlayers.set(username, {
              ...player,
              completedAt: Date.now(),
              finalScore: finalScore
            });

            // Remove player from active lobby
            lobby.players.delete(username);
            console.log(`📊 Lobby ${cid} now has ${lobby.players.size} player(s) remaining`);

            // If no players left, end the challenge for everyone
            if (lobby.players.size === 0) {
              console.log(`🏁 All players have completed in ${cid}, ending challenge`);
              await endChallenge(cid, 'All players completed');
            }
          } else if (player && player.submittedTestsPassed !== 12) {
            // User hasn't passed all tests yet
            player.socket.send(JSON.stringify({
              type: 'cannotEndYet',
              message: `You must pass all 12 test cases before ending your participation (currently passed: ${player.submittedTestsPassed || 0}/12)`
            }));
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
    schedulePlayerDisconnect(ws);
  });
});

// Validate if user can join challenge
async function validateChallengeAccess(cid, username) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query {
            getChallengeById(cid: "${cid}") {
              cid
              status
              participants {
                username
              }
            }
          }
        `
      })
    });

    const json = await res.json();
    const challenge = json.data?.getChallengeById;

    if (!challenge) {
      return { canJoin: false, reason: 'Challenge not found' };
    }

    if (challenge.status === 'ENDED') {
      return { canJoin: false, reason: 'Challenge has already ended' };
    }

    // Check if user is a participant
    const isParticipant = challenge.participants?.some(p => p.username === username);
    if (!isParticipant) {
      return { canJoin: false, reason: 'You are not a participant in this challenge' };
    }

    return { canJoin: true };
  } catch (error) {
    console.error('Error validating challenge access:', error);
    return { canJoin: false, reason: 'Error validating challenge access' };
  }
}

// Start challenge timer
function startChallengeTimer(cid) {
  const lobby = lobbies.get(cid);
  if (!lobby) return;

  const startTime = Date.now();
  const endTime = startTime + CHALLENGE_DURATION;

  lobby.status = 'IN_PROGRESS';
  lobby.timer = {
    startTime,
    endTime,
    intervalId: null
  };

  console.log(`⏰ Started 15-minute timer for challenge: ${cid}`);

  // Broadcast timer start
  broadcast(cid, {
    type: 'timerStarted',
    startTime,
    endTime,
    duration: CHALLENGE_DURATION
  });

  // Set up timer updates every second
  lobby.timer.intervalId = setInterval(() => {
    const remainingTime = Math.max(0, endTime - Date.now());

    broadcast(cid, {
      type: 'timerUpdate',
      remainingTime
    });

    // End challenge when timer reaches zero
    if (remainingTime <= 0) {
      clearInterval(lobby.timer.intervalId);
      endChallenge(cid, 'Timer expired');
    }
  }, 1000);

  // Set main timeout as backup
  setTimeout(() => {
    if (lobby.timer?.intervalId) {
      clearInterval(lobby.timer.intervalId);
      endChallenge(cid, 'Timer expired');
    }
  }, CHALLENGE_DURATION);
}


async function endChallenge(cid, reason) {
  const lobby = lobbies.get(cid);
  if (!lobby || lobby.challengeEnded) return;

  console.log(`🏁 Ending challenge ${cid}. Reason: ${reason}`);

  lobby.challengeEnded = true;
  lobby.status = 'ENDED';


  if (lobby.timer?.intervalId) {
    clearInterval(lobby.timer.intervalId);
  }

  const participantScores = [];


  const allPlayers = [
    ...Array.from(lobby.players.entries()).map(([username, playerData]) => ({
      username,
      score: playerData.submittedResults || 0,
      status: 'active'
    })),
    ...Array.from(lobby.completedPlayers.entries()).map(([username, playerData]) => ({
      username,
      score: playerData.finalScore || playerData.submittedResults || 0,
      status: 'completed'
    }))
  ];

  // Sort all players by score (descending)
  allPlayers.sort((a, b) => b.score - a.score);

  allPlayers.forEach((player, index) => {
    participantScores.push({
      username: player.username,
      score: player.score,
      rank: index + 1
    });
  });

  console.log(`📊 Final scores for ${cid}:`, participantScores);

  broadcast(cid, {
    type: 'challengeEnded',
    reason,
    finalScores: participantScores
  });


  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          mutation {
            endChallenge(
              cid: "${cid}"
              participantScores: ${JSON.stringify(participantScores).replace(/"([^"]+)":/g, '$1:')}
            ) {
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
    console.log(`✅ Challenge ended in backend for ${cid}:`, json.data?.endChallenge);

    // Broadcast final results
    broadcast(cid, {
      type: 'challengeEndedConfirmed',
      data: json.data?.endChallenge
    });

  } catch (err) {
    console.error(`❌ Failed to end challenge in backend for ${cid}:`, err);
  }

  // Clean up lobby after a delay
  setTimeout(() => {
    const lobby = lobbies.get(cid);
    if (lobby) {
      // Clear any remaining disconnect timers
      for (const [username, disconnectedPlayer] of lobby.disconnectedPlayers.entries()) {
        if (disconnectedPlayer.disconnectTimer) {
          clearTimeout(disconnectedPlayer.disconnectTimer);
          console.log(`🧹 Cleared disconnect timer for "${username}" during lobby cleanup`);
        }
      }
    }
    lobbies.delete(cid);
    console.log(`🗑️ Cleaned up lobby: ${cid}`);
  }, 30000); // Keep lobby for 30 seconds for final data
}

// Schedule player disconnect with 5-second grace period
function schedulePlayerDisconnect(ws) {
  for (const [cid, lobby] of lobbies.entries()) {
    for (const [username, player] of lobby.players.entries()) {
      if (player.socket === ws) {
        console.log(`⏳ Player "${username}" disconnected from lobby: ${cid}, starting 5-second grace period...`);

        // Move player to disconnected players with their data
        const playerData = { ...player };
        const disconnectTimer = setTimeout(() => {
          console.log(`⏰ Grace period expired for "${username}", permanently disconnecting...`);
          handlePlayerDisconnect(username, cid);
        }, 5000); // 5-second grace period

        lobby.disconnectedPlayers.set(username, {
          playerData,
          disconnectTimer,
          disconnectedAt: Date.now()
        });

        // Remove from active players but don't notify others yet
        lobby.players.delete(username);
        
        // Notify others that player is temporarily disconnected
        broadcast(cid, {
          type: 'playerDisconnected',
          player: { username, cid },
          temporary: true,
          gracePeriod: 5000
        });

        return;
      }
    }
  }
}

// Handle player disconnect (after grace period or immediate for cleanup)
function handlePlayerDisconnect(username, cid) {
  const lobby = lobbies.get(cid);
  if (!lobby) return;

  console.log(`👋 User "${username}" permanently disconnected from lobby: ${cid}`);

  // Remove from disconnected players if they're there
  if (lobby.disconnectedPlayers.has(username)) {
    const disconnectedPlayer = lobby.disconnectedPlayers.get(username);
    if (disconnectedPlayer.disconnectTimer) {
      clearTimeout(disconnectedPlayer.disconnectTimer);
    }
    lobby.disconnectedPlayers.delete(username);
  }

  // If challenge is in progress and user disconnects, use their latest score
  if (lobby.status === 'IN_PROGRESS' && !lobby.challengeEnded) {
    console.log(`📊 Recording final score for disconnected user "${username}"`);
  }

  console.log(`📊 Lobby ${cid} now has ${lobby.players.size} active player(s) and ${lobby.disconnectedPlayers.size} temporarily disconnected`);

  // Check if lobby should be ended or cleaned up
  const totalPlayers = lobby.players.size + lobby.disconnectedPlayers.size;
  
  // If no players left (active or disconnected) and challenge was in progress, end it
  if (totalPlayers === 0 && lobby.status === 'IN_PROGRESS' && !lobby.challengeEnded) {
    console.log(`🏁 All players disconnected from ${cid}, ending challenge`);
    endChallenge(cid, 'All players disconnected');
  } else if (totalPlayers === 0 && lobby.status === 'WAITING') {
    // Clean up empty waiting lobbies
    lobbies.delete(cid);
    console.log(`🗑️ Empty waiting lobby ${cid} removed`);
  } else if (lobby.players.size > 0) {
    // Notify remaining active players
    broadcast(cid, {
      type: 'playerLeft',
      player: { username, cid },
      permanent: true
    });
  }
}

// Original handlePlayerDisconnect function (kept for legacy WebSocket-based cleanup)
function handlePlayerDisconnectLegacy(ws) {
  for (const [cid, lobby] of lobbies.entries()) {
    for (const [username, player] of lobby.players.entries()) {
      if (player.socket === ws) {
        console.log(`👋 User "${username}" disconnected from lobby: ${cid}`);

        // If challenge is in progress and user disconnects, use their latest score
        if (lobby.status === 'IN_PROGRESS' && !lobby.challengeEnded) {
          console.log(`📊 Recording final score for disconnected user "${username}": ${player.latestScore}`);
        }

        lobby.players.delete(username);
        console.log(`📊 Lobby ${cid} now has ${lobby.players.size} player(s)`);

        // If no players left and challenge was in progress, end it
        if (lobby.players.size === 0 && lobby.status === 'IN_PROGRESS' && !lobby.challengeEnded) {
          console.log(`🏁 All players disconnected from ${cid}, ending challenge`);
          endChallenge(cid, 'All players disconnected');
        } else if (lobby.players.size === 0 && lobby.status === 'WAITING') {

          if (lobby.disconnectedPlayers.size === 0) {
            lobbies.delete(cid);
            console.log(`🗑️ Empty waiting lobby ${cid} removed`);
          } else {
            console.log(`⏳ Waiting lobby ${cid} has ${lobby.disconnectedPlayers.size} disconnected players, keeping alive`);
          }
        } else if (lobby.players.size > 0) {
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
}

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
  console.log(`🚀 WebSocket server running at ${BACKEND_URL}:${PORT}`);
  console.log(`📋 Active lobbies: ${lobbies.size}`);
});

async function startChallengeInBackend(cid) {
  try {
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


function resetLobbyInactivityTimer(cid) {
  const lobby = lobbies.get(cid);
  if (!lobby) return;
  if (lobby.inactivityTimer) {
    clearTimeout(lobby.inactivityTimer);
  }
 
  if (lobby.status === 'WAITING') {
    lobby.inactivityTimer = setTimeout(() => {
      if (lobby.status === 'WAITING') {
        console.log(`⏰ Lobby ${cid} closed due to inactivity (3 minutes)`);
        for (const { socket } of lobby.players.values()) {
          if (socket.readyState === socket.OPEN) {
            socket.send(JSON.stringify({
              type: 'lobbyClosed',
              reason: 'Lobby closed due to inactivity (no challenge started)'
            }));
          }
        }
        lobbies.delete(cid);
      }
    }, 3 * 60 * 1000); 
  }
}