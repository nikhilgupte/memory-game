# Pairingo Game Specification

## UI/UX

### Mode Selection
- **No Local/Online tabs** - All games are inherently shareable
- Opening app = local game by default (hot-seat, 1-4 players)
- Clicking "Invite Players" silently creates a server room and copies a share link
- Others join by clicking the invite URL - no room codes to type

### Controls Visibility
- **Host-only controls in multiplayer:**
  - Restart button (only host can restart)
  - Invite Players button (only host can create invites)
  - Timer toggle (only host can change timer setting)
- **Guest mode:** Cannot see or interact with above controls
- **Local mode:** All controls visible (single player or hotseat)
- **Connection info:** Shows room code and status only when in a multiplayer room

### UI Toggle
- Collapse/expand button hides controls but **scoreboard always stays visible**
- Players can focus on game board while still seeing scores

### Layout
- Timer bar always reserves space in layout (never causes board to jump)
- Smooth fade transitions without layout shifts

---

## Timer Behavior

### Default State
- Timer is **ON by default** when the game starts
- User can toggle the timer on/off via the timer button

### Activation
- Timer does **NOT** run for the entire game
- Timer **starts** when the **first card in a turn** is flipped
- Timer runs from that moment until the **second card is flipped** (or turn ends)

### Timing
- Each turn gets its own independent timer
- Timer duration: **12 seconds to 3 seconds** (scales based on pairs found)
  - At start (0 pairs found): 12 seconds
  - At end (all pairs found): 3 seconds
  - Formula: `max(3, 12 - (pairsDiscovered / TOTAL_PAIRS) * 9)`
- **Timer visible to all players** in multiplayer (not just current player)

### Behavior on Timeout
- If timer expires before second card is flipped:
  - **Local mode**: Auto-advance to next player's turn (if 2 cards not selected)
  - **Remote mode**: Server forces turn to advance to next player

### Multiplayer Timer Sync
- When **host** toggles timer on/off, change **applies to all players**
- Server updates `speedMs` and broadcasts state to all clients
- All players see consistent timer behavior

### Toggle Button
- Timer toggle button (`#timer-toggle-btn`) controls whether timer is active
- Button state: `.active` class = timer enabled, absent = timer disabled
- Toggleable at any time (even before/during game)
- **Host-only in multiplayer** - guests cannot toggle timer

---

## Invite Links

### Share Link Generation
- "Invite Players" button creates a room and generates share link
- Invite link contains **only the room code** (?room=XXX)
- Debug params (like ?cheat=on) are **not** included in invite links
- Clean URLs prevent accidentally sharing debug settings

---

## Cheat Mode

### Activation
- Cheat mode is **query-param based only** (?cheat=on)
- No UI toggle in the controls panel
- Used for testing/development

### Usage
- `http://localhost:3000/?cheat=on` - enables cheat mode
- `http://localhost:3000/` - cheat mode off (default)

---

## Game State

### Player Count
- Local games: Select 1-4 players before starting
- Player count selector hidden during multiplayer
- Restored when returning to local mode

### Restart Button
- **Local mode:** Always available after first card flip
- **Multiplayer (Host):** Visible after first card flip, only host can click
- **Multiplayer (Guest):** Not visible
- Restarts reset scores and shuffle deck

---

## Network/Multiplayer

### Room Creation
- Host creates room via "Invite Players" button
- Room code automatically set in URL (?room=XXX)
- Server listens on all network interfaces (0.0.0.0)
- Accessible via local IP (e.g., http://192.168.x.x:3000)

### Joining
- Guests click invite link (auto-joins via ?room param)
- Or manually enter room code and click "Join Room"

### Disconnection
- Disconnected player shown as "(disconnected)" in scoreboard
- Host can continue playing if guests disconnect
- If all players disconnect, room is cleaned up
