const express = require("express");
const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("crypto");

const TOTAL_PAIRS = 18;
const MAX_PLAYERS = 4;

const app = express();
app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

function createSeed() {
  return crypto.randomBytes(4).readUInt32LE(0);
}

function mulberry32(seed) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), t | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createDeck(seed) {
  const base = [];
  for (let i = 0; i < TOTAL_PAIRS; i += 1) {
    base.push(i, i);
  }
  return shuffle(base, mulberry32(seed));
}

function createRoomId() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function createPlayer(name) {
  return {
    id: crypto.randomBytes(8).toString("hex"),
    name,
    score: 0,
    connected: true,
  };
}

function getNextActiveIndex(room, startIndex) {
  if (!room.players.length) {
    return 0;
  }
  let index = startIndex;
  for (let i = 0; i < room.players.length; i += 1) {
    index = (index + 1) % room.players.length;
    if (room.players[index].connected) {
      return index;
    }
  }
  return startIndex;
}

function buildState(room) {
  return {
    roomId: room.id,
    deck: room.deck,
    matched: Array.from(room.matched),
    revealed: room.revealed.slice(),
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      connected: player.connected,
    })),
    currentPlayerId: room.players[room.currentPlayerIndex]
      ? room.players[room.currentPlayerIndex].id
      : null,
    locked: room.locked,
    gameOver: room.matched.size === TOTAL_PAIRS,
    turnCount: room.turnCount,
    speedMs: room.speedMs,
  };
}

function broadcast(room, payload) {
  const message = JSON.stringify(payload);
  room.players.forEach((player) => {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function startTurnTimer(room) {
  clearTurnTimer(room);
  if (!room.speedMs || room.matched.size === TOTAL_PAIRS) return;
  room.turnTimer = setTimeout(() => {
    // Force-advance: clear any partial reveal, advance player
    room.revealed = [];
    room.locked = false;
    room.currentPlayerIndex = getNextActiveIndex(room, room.currentPlayerIndex);
    broadcast(room, { type: "state-update", state: buildState(room) });
    startTurnTimer(room); // start fresh for new player
  }, room.speedMs);
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
}

function resetRoom(room) {
  if (room.pendingTimeout) {
    clearTimeout(room.pendingTimeout);
  }
  clearTurnTimer(room);
  room.seed = createSeed();
  room.deck = createDeck(room.seed);
  room.matched = new Set();
  room.revealed = [];
  room.locked = false;
  room.currentPlayerIndex = 0;
  room.turnCount = 0;
  room.players.forEach((player) => {
    player.score = 0;
  });
}

function handleCreateRoom(ws, { speedMs = 0 } = {}) {
  const roomId = createRoomId();
  const seed = createSeed();
  const room = {
    id: roomId,
    seed,
    deck: createDeck(seed),
    matched: new Set(),
    revealed: [],
    locked: false,
    players: [],
    currentPlayerIndex: 0,
    hostId: null,
    pendingTimeout: null,
    turnCount: 0,
    speedMs: speedMs || 0,
    turnTimer: null,
  };
  const player = createPlayer("Player 1");
  player.ws = ws;
  room.players.push(player);
  room.hostId = player.id;
  rooms.set(roomId, room);

  ws.roomId = roomId;
  ws.playerId = player.id;

  send(ws, {
    type: "room-created",
    roomId,
    playerId: player.id,
    isHost: true,
    state: buildState(room),
  });
}

function handleJoinRoom(ws, roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }
  if (room.players.length >= MAX_PLAYERS) {
    send(ws, { type: "error", message: "Room is full." });
    return;
  }

  const player = createPlayer(`Player ${room.players.length + 1}`);
  player.ws = ws;
  room.players.push(player);

  ws.roomId = roomId;
  ws.playerId = player.id;

  send(ws, {
    type: "room-joined",
    roomId,
    playerId: player.id,
    isHost: room.hostId === player.id,
    state: buildState(room),
  });

  broadcast(room, { type: "state-update", state: buildState(room) });
}

function handleSelect(ws, index) {
  const room = rooms.get(ws.roomId);
  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }
  if (!Number.isInteger(index) || index < 0 || index >= room.deck.length) {
    send(ws, { type: "error", message: "Invalid card selection." });
    return;
  }
  const playerIndex = room.players.findIndex(
    (player) => player.id === ws.playerId
  );
  if (playerIndex !== room.currentPlayerIndex) {
    send(ws, { type: "error", message: "Not your turn." });
    return;
  }
  if (room.locked) {
    return;
  }
  if (room.matched.has(index) || room.revealed.includes(index)) {
    return;
  }

  clearTurnTimer(room);
  room.revealed.push(index);
  broadcast(room, { type: "state-update", state: buildState(room) });

  if (room.revealed.length < 2) {
    return;
  }

  room.turnCount += 1;
  room.locked = true;
  const [first, second] = room.revealed;
  const isMatch = room.deck[first] === room.deck[second];

  if (isMatch) {
    room.matched.add(first);
    room.matched.add(second);
    room.players[room.currentPlayerIndex].score += 1;
    room.revealed = [];
    room.locked = false;
    broadcast(room, { type: "state-update", state: buildState(room) });
    startTurnTimer(room);
    return;
  }

  room.pendingTimeout = setTimeout(() => {
    room.revealed = [];
    room.locked = false;
    room.currentPlayerIndex = getNextActiveIndex(
      room,
      room.currentPlayerIndex
    );
    broadcast(room, { type: "state-update", state: buildState(room) });
    startTurnTimer(room);
  }, 900);
}

function handleRestart(ws) {
  const room = rooms.get(ws.roomId);
  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }
  if (room.hostId !== ws.playerId) {
    send(ws, { type: "error", message: "Only the host can restart." });
    return;
  }
  resetRoom(room);
  broadcast(room, { type: "state-update", state: buildState(room) });
}

function handleDisconnect(ws) {
  const room = rooms.get(ws.roomId);
  if (!room) {
    return;
  }
  const player = findPlayer(room, ws.playerId);
  if (player) {
    player.connected = false;
    player.ws = null;
  }
  room.currentPlayerIndex = getNextActiveIndex(room, room.currentPlayerIndex);
  broadcast(room, { type: "state-update", state: buildState(room) });

  const anyoneConnected = room.players.some((p) => p.connected);
  if (!anyoneConnected) {
    rooms.delete(room.id);
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      send(ws, { type: "error", message: "Invalid message format." });
      return;
    }

    switch (message.type) {
      case "create-room":
        handleCreateRoom(ws, { speedMs: message.speedMs });
        break;
      case "join-room":
        handleJoinRoom(ws, String(message.roomId || "").trim().toUpperCase());
        break;
      case "select-card":
        handleSelect(ws, Number(message.index));
        break;
      case "restart-game":
        handleRestart(ws);
        break;
      default:
        send(ws, { type: "error", message: "Unknown message type." });
        break;
    }
  });

  ws.on("close", () => {
    handleDisconnect(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Memory game server running at http://localhost:${PORT}`);
});
