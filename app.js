const TOTAL_PAIRS = 18;
const OBJECT_TYPES = [
  "pizza",
  "burger",
  "cookie",
  "dog",
  "cat",
  "butterfly",
  "soccer",
  "football",
  "video game",
  "guitar",
  "wrench",
  "hammer",
  "computer",
  "phone",
  "tree",
  "sunflower",
  "airplane",
  "circus",
];

const board = document.getElementById("game-board");
const statusText = document.getElementById("status");
const inviteButton = document.getElementById("invite-btn");
const joinButton = document.getElementById("join-btn");
const joinSection = document.getElementById("join-section");
const disconnectButton = document.getElementById("disconnect-btn");
const roomInput = document.getElementById("room-input");
const roomCode = document.getElementById("room-code");
const connectionStatus = document.getElementById("connection-status");
const scoreboard = document.getElementById("scoreboard");
const playerCountInputs = Array.from(
  document.querySelectorAll("input[name='player-count']")
);

let deck = [];
let players = [];
let currentPlayerIndex = 0;
let firstSelection = null;
let secondSelection = null;
let lockBoard = false;
let matchedPairs = 0;
let multiplayerGameOver = false;
let currentDeckSignature = "";
let turnCount = 0;
let turnTimerInterval = null;
let turnTimerDisplay = null;
let localGameSpeedMs = 0;
let pendingInviteCopy = false;
let multiplayerTurnTimerStarted = false;
let currentCardBackPattern = "";
let currentCardBackColor = "";

const CARD_BACK_PATTERNS = ["pattern-lines", "pattern-dots", "pattern-grid", "pattern-solid"];

const multiplayer = {
  active: false,
  socket: null,
  roomId: null,
  playerId: null,
  isHost: false,
};

function getPlayerCount() {
  const selected = document.querySelector("input[name='player-count']:checked");
  return Number(selected ? selected.value : 2);
}

function setStatus(message) {
  statusText.textContent = message;
}

function setTurnIndicator(message) {
  const indicator = document.getElementById('turn-indicator');
  if (indicator) {
    indicator.textContent = message;
  }
}

function setRoomCode(code) {
  roomCode.textContent = code || "-";
}

function setConnectionStatus(message) {
  connectionStatus.textContent = message;
}

function setPlayerControlsDisabled(disabled) {
  playerCountInputs.forEach((input) => {
    input.disabled = disabled;
  });
}

function updateMultiplayerControls() {
  setPlayerControlsDisabled(multiplayer.active);
  updateJoinDisconnectUI();
}

function updateJoinDisconnectUI() {
  // Show disconnect button only when connected to a room
  if (multiplayer.active) {
    if (joinSection) joinSection.classList.add('hidden');
    if (disconnectButton) disconnectButton.classList.remove('hidden');
  } else {
    if (joinSection) joinSection.classList.remove('hidden');
    if (disconnectButton) disconnectButton.classList.add('hidden');
  }
}

function buildIconSet() {
  return OBJECT_TYPES.slice(0, TOTAL_PAIRS).map((name, index) => ({
    id: index,
    name,
  }));
}

function getEmojiForIcon(type) {
  const emojiMap = {
    pizza: "🍕",
    burger: "🍔",
    cookie: "🍪",
    dog: "🐕",
    cat: "🐈",
    butterfly: "🦋",
    soccer: "⚽",
    football: "🏈",
    "video game": "🎮",
    guitar: "🎸",
    wrench: "🔧",
    hammer: "🔨",
    computer: "💻",
    phone: "📱",
    tree: "🌲",
    sunflower: "🌻",
    airplane: "✈️",
    circus: "🎪",
  };
  return emojiMap[type] || "❓";
}

function createIconData(icon) {
  return getEmojiForIcon(icon.name);
}

function shuffle(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildDeckFromOrder(order) {
  const icons = buildIconSet();
  return order.map((matchId, index) => {
    const icon = icons[matchId];
    const image = createIconData(icon);
    return {
      id: index,
      matchId,
      image,
      label: `${icon.name} icon`,
      matched: false,
      flipped: false,
    };
  });
}

function createDeck() {
  const icons = buildIconSet();
  const order = [];
  icons.forEach((icon) => {
    order.push(icon.id, icon.id);
  });
  const shuffledOrder = shuffle(order);
  return buildDeckFromOrder(shuffledOrder);
}

function renderScoreboard() {
  scoreboard.innerHTML = "";
  const highestScore = players.length
    ? Math.max(...players.map((player) => player.score))
    : 0;
  const gameOver = multiplayer.active
    ? multiplayerGameOver
    : matchedPairs === TOTAL_PAIRS;

  players.forEach((player, index) => {
    const item = document.createElement("li");
    item.className = "score-item";
    if (index === currentPlayerIndex) {
      item.classList.add("active");
    }
    if (gameOver && player.score === highestScore) {
      item.classList.add("leader");
    }
    const name =
      player.connected === false ? `${player.name} (disconnected)` : player.name;
    item.textContent = `${name}: ${player.score}`;
    scoreboard.appendChild(item);
  });
}

function getRandomDarkColor() {
  // Generate random dark colors (hues 0-360, low saturation for dark tones)
  const hue = Math.floor(Math.random() * 360);
  const saturation = Math.floor(Math.random() * 30) + 20; // 20-50%
  const lightness = Math.floor(Math.random() * 20) + 35; // 35-55% (dark)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function renderBoard() {
  board.innerHTML = "";
  const cheatMode = document.getElementById('cheat-mode')?.checked || false;
  deck.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.index = String(index);
    button.dataset.matchId = String(card.matchId);
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", "Hidden card");
    let frontText = '';
    if (cheatMode) {
      frontText = String(card.matchId);
    }
    button.innerHTML =
      `<span class="card-face card-front ${currentCardBackPattern}" style="background-color: ${currentCardBackColor}; --card-color: ${currentCardBackColor};">${frontText}</span>` +
      `<span class="card-face card-back emoji-icon">${card.image}</span>`;
    if (cheatMode) {
      button.classList.add('cheat-mode');
    }
    board.appendChild(button);
  });
}

function updateCardUI(index) {
  const button = board.querySelector(`button[data-index="${index}"]`);
  if (!button) {
    return;
  }
  const card = deck[index];
  const showBack = card.flipped || card.matched;
  button.classList.toggle("flipped", showBack);
  button.classList.toggle("matched", card.matched);
  button.disabled = card.matched;
  button.setAttribute("aria-label", showBack ? `Card ${card.label}` : "Hidden card");
}

function resetSelections() {
  firstSelection = null;
  secondSelection = null;
}

function advancePlayer() {
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  // Update turn indicator immediately
  const turnMsg = players.length === 1 ? "Your turn" : `${players[currentPlayerIndex].name}'s turn`;
  setTurnIndicator(turnMsg);
}

function endGame() {
  clearTurnTimer();
  lockBoard = true;
  const highestScore = Math.max(...players.map((player) => player.score));
  let message = "";
  if (players.length === 1) {
    message = `You found ${highestScore} pairs!`;
  } else {
    const winners = players
      .filter((player) => player.score === highestScore)
      .map((player) => player.name);
    message =
      winners.length === 1
        ? `${winners[0]} wins with ${highestScore} pairs!`
        : `Tie between ${winners.join(" and ")} with ${highestScore} pairs each.`;
  }

  board.querySelectorAll("button.card").forEach((button) => {
    button.disabled = true;
  });

  renderScoreboard();
  setStatus(`Game over! ${message}`);
}

function handleMatch(firstIndex, secondIndex) {
  clearTurnTimer();
  deck[firstIndex].matched = true;
  deck[secondIndex].matched = true;
  matchedPairs += 1;
  players[currentPlayerIndex].score += 1;

  updateCardUI(firstIndex);
  updateCardUI(secondIndex);
  renderScoreboard();
  const message =
    players.length === 1
      ? "Match! Keep going."
      : `${players[currentPlayerIndex].name} found a match and goes again.`;
  setStatus(message);

  window.setTimeout(() => {
    resetSelections();
    if (matchedPairs === TOTAL_PAIRS) {
      endGame();
    } else {
      lockBoard = false;
    }
  }, 600);
}

function handleMismatch(firstIndex, secondIndex) {
  clearTurnTimer();
  const message =
    players.length === 1 ? "No match. Try again." : "No match. Next player's turn.";
  setStatus(message);
  window.setTimeout(() => {
    deck[firstIndex].flipped = false;
    deck[secondIndex].flipped = false;
    updateCardUI(firstIndex);
    updateCardUI(secondIndex);
    advancePlayer();
    renderScoreboard();
    const turnMessage =
      players.length === 1
        ? "Your turn. Select two cards."
        : `${players[currentPlayerIndex].name}'s turn.`;
    setStatus(turnMessage);
    resetSelections();
    lockBoard = false;
  }, 800);
}

function evaluateSelection() {
  const firstCard = deck[firstSelection];
  const secondCard = deck[secondSelection];

  if (firstCard.matchId === secondCard.matchId) {
    handleMatch(firstSelection, secondSelection);
  } else {
    handleMismatch(firstSelection, secondSelection);
  }
}

function startTurnTimer(ms) {
  clearTurnTimer();
  if (!ms) {
    console.log('startTurnTimer: ms is 0 or falsy, skipping');
    return;
  }
  const timerEl = document.getElementById('turn-timer');
  const fillEl = document.getElementById('timer-fill');
  if (!timerEl || !fillEl) {
    console.error('Timer elements not found');
    return;
  }
  console.log('Timer started for', ms, 'ms');
  timerEl.classList.remove('hidden');
  fillEl.style.transition = 'none';
  fillEl.style.width = '100%';
  const start = Date.now();

  turnTimerDisplay = setInterval(() => {
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, ms - elapsed);
    const pct = (remaining / ms) * 100;
    fillEl.style.transition = 'width 0.1s linear';
    fillEl.style.width = pct + '%';
    if (remaining <= 3000) {
      timerEl.classList.add('urgent');
    }
  }, 50);

  turnTimerInterval = setTimeout(() => {
    console.log('Timer expired!');
    clearTurnTimer();
    // Time's up - if player hasn't flipped 2 cards, auto-advance (local mode only)
    if (secondSelection === null && !multiplayer.active) {
      console.log('Auto-advancing turn');
      handleTimeoutTurn();
    }
  }, ms);
}

function handleTimeoutTurn() {
  if (firstSelection !== null) {
    // Flip back any revealed card
    deck[firstSelection].flipped = false;
    updateCardUI(firstSelection);
  }
  resetSelections();
  advancePlayer();
  renderScoreboard();
  const turnMessage =
    players.length === 1
      ? "Time's up! Your turn. Select two cards."
      : `${players[currentPlayerIndex].name}'s turn.`;
  setStatus(turnMessage);
  const turnIndicatorMsg = players.length === 1 ? "Your turn" : `${players[currentPlayerIndex].name}'s turn`;
  setTurnIndicator(turnIndicatorMsg);
  lockBoard = false;
  // Timer will start when the next player flips their first card
}

function clearTurnTimer() {
  if (turnTimerDisplay) {
    clearInterval(turnTimerDisplay);
    turnTimerDisplay = null;
  }
  if (turnTimerInterval) {
    clearTimeout(turnTimerInterval);
    turnTimerInterval = null;
  }
  const timerEl = document.getElementById('turn-timer');
  if (timerEl) {
    timerEl.classList.add('hidden');
    timerEl.classList.remove('urgent');
  }
}

function handleCardSelection(index) {
  if (multiplayer.active) {
    if (lockBoard) {
      return;
    }
    const currentPlayer = players[currentPlayerIndex];
    if (currentPlayer && currentPlayer.id !== multiplayer.playerId) {
      return;
    }
    sendMessage({ type: "select-card", index });
    return;
  }

  if (lockBoard) {
    return;
  }

  const card = deck[index];
  if (!card || card.flipped || card.matched) {
    return;
  }

  card.flipped = true;
  updateCardUI(index);

  if (firstSelection === null) {
    // Show restart button on first card flip
    showRestartButton();
    // Increment turn counter when a new turn starts
    turnCount += 1;
    firstSelection = index;
    // Check if timer is enabled
    const timerEnabled = document.getElementById('timer-toggle-btn')?.classList.contains('active') || false;
    if (timerEnabled) {
      // Calculate time based on pairs discovered: 8s at start, 3s when all pairs found
      const pairsDiscovered = matchedPairs;
      const timeSeconds = Math.max(3, 8 - (pairsDiscovered / TOTAL_PAIRS) * 5);
      const timeMs = timeSeconds * 1000;
      console.log('Pairs discovered:', pairsDiscovered, 'Time per turn:', timeSeconds, 's');
      startTurnTimer(timeMs);
    }
    const promptMessage =
      players.length === 1
        ? "Select another card."
        : `${players[currentPlayerIndex].name}'s turn. Select another card.`;
    setStatus(promptMessage);
    const turnMsg = players.length === 1 ? "Your turn" : `${players[currentPlayerIndex].name}'s turn`;
    setTurnIndicator(turnMsg);
    return;
  }

  secondSelection = index;
  lockBoard = true;
  evaluateSelection();
}

function startGame() {
  if (multiplayer.active) {
    return;
  }
  // Hide restart button until first card is flipped
  if (restartButton) {
    restartButton.classList.add('hidden');
  }
  players = Array.from({ length: getPlayerCount() }, (_, index) => ({
    name: `Player ${index + 1}`,
    score: 0,
  }));
  currentPlayerIndex = 0;
  firstSelection = null;
  secondSelection = null;
  lockBoard = false;
  matchedPairs = 0;
  multiplayerGameOver = false;
  turnCount = 0;
  // Pick a random card back pattern and color for this game
  currentCardBackPattern = CARD_BACK_PATTERNS[Math.floor(Math.random() * CARD_BACK_PATTERNS.length)];
  currentCardBackColor = getRandomDarkColor();
  deck = createDeck();
  currentDeckSignature = "";

  renderBoard();
  renderScoreboard();
  setStatus(`${players[currentPlayerIndex].name}'s turn. Select two cards.`);
  setTurnIndicator(`${players[currentPlayerIndex].name}'s turn`);
}

function updateUrlWithRoom(roomId) {
  const url = new URL(window.location.href);
  if (roomId) {
    url.searchParams.set("room", roomId);
  } else {
    url.searchParams.delete("room");
  }
  window.history.replaceState({}, "", url.toString());
}

function applyServerState(state) {
  if (!state) {
    return;
  }
  const signature = state.deck.join(",");
  if (signature !== currentDeckSignature) {
    deck = buildDeckFromOrder(state.deck);
    currentDeckSignature = signature;
    // Generate a new color and pattern for each new game
    currentCardBackPattern = CARD_BACK_PATTERNS[Math.floor(Math.random() * CARD_BACK_PATTERNS.length)];
    currentCardBackColor = getRandomDarkColor();
    renderBoard();
  }

  const matchedSet = new Set(state.matched);
  const revealedSet = new Set(state.revealed);
  deck.forEach((card, index) => {
    card.matched = matchedSet.has(index);
    card.flipped = card.matched || revealedSet.has(index);
    updateCardUI(index);
  });

  players = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
    connected: player.connected,
  }));
  currentPlayerIndex = players.findIndex(
    (player) => player.id === state.currentPlayerId
  );
  lockBoard = state.locked;
  multiplayerGameOver = state.gameOver;

  turnCount = state.turnCount || 0;

  // Start timer only once when first card in turn is flipped (and timer is enabled)
  // Timer is visible to all players, not just the current player
  const hasFirstCardFlipped = state.revealed && state.revealed.length === 1;
  const timerEnabled = document.getElementById('timer-toggle-btn')?.classList.contains('active') || false;

  if (hasFirstCardFlipped && state.speedMs && timerEnabled && !multiplayerTurnTimerStarted) {
    // First card just flipped, start the timer for everyone (if timer is enabled)
    multiplayerTurnTimerStarted = true;
    startTurnTimer(state.speedMs);
  } else if (!hasFirstCardFlipped) {
    // No cards revealed yet, reset the flag for next turn
    multiplayerTurnTimerStarted = false;
    clearTurnTimer();
  } else if (!timerEnabled) {
    // Timer is disabled, ensure it's cleared
    clearTurnTimer();
  }

  // Show restart button for host when first card in game is flipped
  if (hasFirstCardFlipped && multiplayer.isHost && restartButton) {
    restartButton.classList.remove('hidden');
  }

  renderScoreboard();
  if (state.gameOver) {
    const highestScore = Math.max(...players.map((player) => player.score));
    const winners = players
      .filter((player) => player.score === highestScore)
      .map((player) => player.name);
    const message =
      winners.length === 1
        ? `${winners[0]} wins with ${highestScore} pairs!`
        : `Tie between ${winners.join(" and ")} with ${highestScore} pairs each.`;
    setStatus(`Game over! ${message}`);
    return;
  }

  const currentPlayer = players[currentPlayerIndex];
  if (!currentPlayer) {
    setStatus("Waiting for players...");
    return;
  }
  if (currentPlayer.id === multiplayer.playerId) {
    setStatus("Your turn. Select two cards.");
    setTurnIndicator("Your turn");
  } else {
    setStatus(`${currentPlayer.name}'s turn.`);
    setTurnIndicator(`${currentPlayer.name}'s turn`);
  }
}

function getSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

function ensureSocket() {
  if (
    multiplayer.socket &&
    (multiplayer.socket.readyState === WebSocket.OPEN ||
      multiplayer.socket.readyState === WebSocket.CONNECTING)
  ) {
    return multiplayer.socket;
  }
  const socket = new WebSocket(getSocketUrl());
  multiplayer.socket = socket;
  setConnectionStatus("Connecting...");

  socket.addEventListener("open", () => {
    setConnectionStatus("Connected");
  });

  socket.addEventListener("close", () => {
    setConnectionStatus("Disconnected");
    if (multiplayer.active) {
      multiplayer.active = false;
      multiplayer.roomId = null;
      multiplayer.playerId = null;
      multiplayer.isHost = false;
      setRoomCode("");
      updateUrlWithRoom(null);
      updateMultiplayerControls();
      // Restore player count selector to local mode
      const playerCountSelector = document.querySelector('.player-count-selector');
      if (playerCountSelector) {
        playerCountSelector.classList.remove('hidden');
      }
      // Hide connection info
      const connectionInfo = document.getElementById('connection-info');
      if (connectionInfo) {
        connectionInfo.classList.add('hidden');
      }
      // Restore buttons in local mode
      if (restartButton) {
        restartButton.classList.add('hidden'); // Hidden until first card flip
      }
      if (inviteButton) inviteButton.classList.remove('hidden');
      const timerBtn = document.getElementById('timer-toggle-btn');
      if (timerBtn) timerBtn.classList.remove('hidden');
      // Update join/disconnect button visibility
      updateJoinDisconnectUI();
      setStatus("Disconnected from multiplayer. Starting local game.");
      startGame();
    }
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      setStatus("Received an invalid message.");
      return;
    }

    switch (message.type) {
      case "room-created":
      case "room-joined":
        multiplayer.active = true;
        multiplayer.roomId = message.roomId;
        multiplayer.playerId = message.playerId;
        multiplayer.isHost = Boolean(message.isHost);
        setRoomCode(message.roomId);
        updateUrlWithRoom(message.roomId);
        updateMultiplayerControls();
        multiplayerTurnTimerStarted = false;
        // Pick a random card back pattern and color for this game
        currentCardBackPattern = CARD_BACK_PATTERNS[Math.floor(Math.random() * CARD_BACK_PATTERNS.length)];
        currentCardBackColor = getRandomDarkColor();
        // Hide player count selector in multiplayer mode
        const playerCountSelector = document.querySelector('.player-count-selector');
        if (playerCountSelector) {
          playerCountSelector.classList.add('hidden');
        }
        // Show connection info
        const connectionInfo = document.getElementById('connection-info');
        if (connectionInfo) {
          connectionInfo.classList.remove('hidden');
        }
        // Update join/disconnect button visibility
        updateJoinDisconnectUI();
        // Hide buttons for non-hosts in multiplayer
        if (!multiplayer.isHost) {
          if (restartButton) restartButton.classList.add('hidden');
          if (inviteButton) inviteButton.classList.add('hidden');
          const timerBtn = document.getElementById('timer-toggle-btn');
          if (timerBtn) timerBtn.classList.add('hidden');
        } else {
          // Host: ensure buttons are visible
          if (inviteButton) inviteButton.classList.remove('hidden');
          const timerBtn = document.getElementById('timer-toggle-btn');
          if (timerBtn) timerBtn.classList.remove('hidden');
        }
        applyServerState(message.state);
        if (pendingInviteCopy) {
          pendingInviteCopy = false;
          doCopyLink();
        }
        break;
      case "state-update":
        applyServerState(message.state);
        break;
      case "error":
        setStatus(message.message || "Something went wrong.");
        break;
      default:
        break;
    }
  });

  return socket;
}

function sendMessage(payload) {
  const socket = ensureSocket();
  const message = JSON.stringify(payload);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(message);
    return;
  }
  socket.addEventListener(
    "open",
    () => {
      socket.send(message);
    },
    { once: true }
  );
}

function hostMultiplayer() {
  const timerEnabled = document.getElementById('timer-toggle-btn')?.classList.contains('active') || false;
  // Calculate initial speedMs: 12 seconds if timer enabled, 0 if disabled
  const speedMs = timerEnabled ? 12000 : 0;
  sendMessage({ type: "create-room", speedMs });
}

function joinMultiplayer(code) {
  if (!code) {
    setStatus("Enter a room code to join.");
    return;
  }
  sendMessage({ type: "join-room", roomId: code });
}

function fallbackCopyInvite(link) {
  window.prompt("Copy this link to invite others:", link);
  setStatus("Invite link ready. Share it with your players.");
}

function doCopyLink() {
  // Create clean invite URL with only the room param (no cheat or other params)
  const url = new URL(window.location.href);
  url.search = ""; // Clear all params
  url.searchParams.set("room", multiplayer.roomId);
  const link = url.toString();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(link)
      .then(() => setStatus("Invite link copied! Share it to let others join."))
      .catch(() => fallbackCopyInvite(link));
  } else {
    fallbackCopyInvite(link);
  }
}

function copyInviteLink() {
  if (multiplayer.roomId) {
    // Already in a room — just copy the link
    doCopyLink();
  } else {
    // Create a room first, copy link once room-created fires
    pendingInviteCopy = true;
    hostMultiplayer();
  }
}

board.addEventListener("click", (event) => {
  const button = event.target.closest("button.card");
  if (!button) {
    return;
  }
  handleCardSelection(Number(button.dataset.index));
});

// Restart button removed - game auto-starts on first card flip

inviteButton.addEventListener("click", () => {
  copyInviteLink();
});

joinButton.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();
  joinMultiplayer(code);
});

roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const code = roomInput.value.trim().toUpperCase();
    joinMultiplayer(code);
  }
});

disconnectButton.addEventListener("click", () => {
  if (multiplayer.socket && multiplayer.socket.readyState === WebSocket.OPEN) {
    multiplayer.socket.close();
  }
});

// Restart button
const restartButton = document.getElementById('restart-btn');
if (restartButton) {
  restartButton.classList.add('hidden'); // Hidden until game starts
  restartButton.addEventListener('click', () => {
    if (multiplayer.active) {
      sendMessage({ type: "restart-game" });
    } else {
      startGame();
    }
  });
}

function showRestartButton() {
  if (restartButton) {
    // Only show restart button for host in multiplayer, always show in local
    if (multiplayer.active && !multiplayer.isHost) {
      restartButton.classList.add('hidden');
    } else {
      restartButton.classList.remove('hidden');
    }
  }
}


// Timer toggle button
const timerToggleBtn = document.getElementById('timer-toggle-btn');
if (timerToggleBtn) {
  timerToggleBtn.addEventListener('click', () => {
    timerToggleBtn.classList.toggle('active');
    // If in multiplayer and host, broadcast timer change to all players
    if (multiplayer.active && multiplayer.isHost) {
      const timerEnabled = timerToggleBtn.classList.contains('active');
      const speedMs = timerEnabled ? 12000 : 0;
      sendMessage({ type: "update-timer", speedMs });
    }
  });
}

// UI toggle (slide controls/scoreboard off-screen)
const toggleUIBtn = document.getElementById("toggle-ui");
const app = document.querySelector(".app");

toggleUIBtn.addEventListener("click", () => {
  app.classList.toggle("ui-hidden");
  toggleUIBtn.classList.toggle("collapsed");
});

const roomParam = new URLSearchParams(window.location.search).get("room");
if (roomParam) {
  roomInput.value = roomParam;
  joinMultiplayer(roomParam.toUpperCase());
}

// Enable cheat mode if ?cheat=on is in the URL
const cheatParam = new URLSearchParams(window.location.search).get("cheat");
const cheatModeCheckbox = document.getElementById('cheat-mode');
if (cheatParam === "on" && cheatModeCheckbox) {
  cheatModeCheckbox.checked = true;
}

updateMultiplayerControls();
startGame();
