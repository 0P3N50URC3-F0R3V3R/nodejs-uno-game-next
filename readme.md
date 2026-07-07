# UNO Web

A multiplayer browser-based UNO card game with persistent accounts, achievements, leaderboards, and full localization in 23 languages.

> **Based on** [houseofbits/nodejs-uno-game](https://github.com/houseofbits/nodejs-uno-game) — the original Node.js + Vue UNO engine. This project extends it with a full user system, achievement framework, statistics, daily/weekly challenges, jukebox, admin panel, and many gameplay improvements.

---

## Screenshots
<img width="792" height="387" alt="image" src="https://github.com/user-attachments/assets/4e5d3083-f8c3-4696-b7ab-633be1ea732a" />
<img width="692" height="587" alt="image" src="https://github.com/user-attachments/assets/659a84ff-37ad-43af-9a9b-fccce32b8530" />
<img width="691" height="742" alt="image" src="https://github.com/user-attachments/assets/d3cb2e63-74b9-45e5-a93f-20f952e4e80f" />


## Features

### Gameplay
- Classic UNO rules with card deck reshuffling, skip, reverse, draw-two, wild, and wild draw-four
- **Rulesets**: Original (standard UNO) and Stacking / Punishment Stack (+2/+4 cards stack to +8 max)
- Nextgen Ruleset: Addition to the original gameplay with more cards, stacking and punishment cards
- Double deck gamemode
- Battle Royale gamemode - Only 1 can left 
- Up to 5 players per room (human + AI)
- AI opponents with configurable difficulty (Easy / Medium / Hard)
- Room passwords for private games
- Animated card plays, GSAP-powered dealing and drawing
- Spin-wheel animation for selecting the first player
- 6 customizable table backgrounds

### Federation Networking - Prototype

## THIS IS A PROTOTYPE FEATURE, NOT TESTED!!! NOT FINISHED!

- Now you can federate servers.  You can add each other server's in the admin interface, and the server's can collaborate in games.
Both server owners need to add each other server:port in admin interface, only after that will handshake happen. After that they 
will sync player ID's, and exchange keys. After each server users can play with other server's players, in the background there are 
channel and user syncing, even the hall of fame.

## THIS IS A PROTOTYPE FEATURE, NOT TESTED!!! NOT FINISHED!

### User Accounts
- Register and login with persistent profiles
- Avatar upload (auto-cropped to 250×250 PNG)
- Change username and password in-profile
- XP and level progression (120 levels, XP scales per level)
- Per-session single-login enforcement — logging in on a new device kicks the previous session with an overlay notification

### Achievements
Achievements are grouped into four categories:

| Category | Description |
|---|---|
| Beginner | First wins, first UNO call, chat, jukebox, quit, avatar |
| Advanced | Speed wins, color-change milestones, punishment-stack milestones, passive play |
| Online | Hosting games, joining, leaderboard ranks, long play streaks |
| Legendary | Rare feats: winning without playing action cards, series sweeps, marathon sessions |

Each achievement awards **AP (Achievement Points)** and XP. A toast notification with animation fires on unlock mid-game.

### Daily & Weekly Challenges
- Generated daily challenges and weekly challenges fresh each period
- Challenge types include: play N action cards, win N rounds, call UNO N times, play for N minutes, etc.
- Progress tracked in real time during matches; XP and AP rewarded on completion

### Leaderboards & Player Search
- Global leaderboard by XP/level, wins, losses, cards played, total play time, longest match, wild cards
- Search any player by username; click to open their public profile modal showing level, stats, and unlocked achievements

### Social part
- Global Chat
- Ingamne Chat
- PM chat per player
- Friend system
- Invitation System

### Ingame Store
- Gold money added - only achievable thru playing games and completing achievements and challanges.
- You can buy animated rectangles
- You can buy animated backgrounds
- You can buy titles
- You can buy Name text effects. 

### Side Panels
Six collapsible side panels, each pinnable (persists across sessions via localStorage):

| Panel | Icon | Contents |
|---|---|---|
| Scores | 🏆 | In-game score table with XP gain preview |
| Achievements | 🏅 | Your unlocked achievements, AP total, daily/weekly challenge progress |
| Jukebox | 🎵 | Music player — play/pause, track list, volume |
| Chat | 💬 | In-room chat with unread badge |
| Player Search | 🔍 | Search and view player profiles |
| Menu | ⚙️ | Restart, quit, table picker, ruleset selector |

### Audio
- 14+ sound effects: card deals, UNO calls, missed UNO penalties, round wins/losses, +8 stacks, countdowns, turn chimes
- Music tracks served from `public/snd/music/` — add `.mp3` files to extend the playlist
- Default tracks sourced from [New Retro Wave](https://www.youtube.com/@NewRetroWave) (royalty-free releases)
- Turn chime toggle, per-volume sliders for effects and music

### Localization
Full UI translation in 23 languages via a runtime language switcher:

Bulgarian · Czech · Danish · German · Greek · English · Spanish · Finnish · French · Hungarian · Indonesian · Italian · Dutch · Norwegian · Polish · Portuguese (BR) · Portuguese (PT) · Romanian · Russian · Swedish · Turkish · Ukrainian · Vietnamese

### Scale-to-Fit
- Desktop: game scales down proportionally if the browser window is smaller than 1300×870, preserving the full layout
- Mobile/tablet: native layout (no scale transform), suitable for portrait and landscape

### Extended menus
- Ingame Manual
- Ingame Forum board system - config thru admin interface.

### Admin interface
- News system
- Editing Users
- Gold rates
- Forum editing
- Store Editing
- Prices Editing
- Items upload/delete/edit/create to the store.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 2 (Options API), GSAP 3, Socket.IO client |
| Backend | Node.js, Express, Socket.IO |
| Database | SQLite via `better-sqlite3` |
| Build | Webpack via Vue CLI |
| Image processing | `sharp` (avatar resizing) |
| Audio | Howler.js |

---

## Setup

### Requirements
- Node.js 16+
- npm

### Docker

```bash
docker-compose up
```

Runs the built app in a container accessible on your local network.


### Local development

```bash
git clone <repo>
cd unoweb
npm install
npm run build
node server.js
```

Server starts on port 80 by default. Change in `server.js` (`server.listen(80)`).

### Config

Create `config.json` in the project root:

```json
{
    "adminPassword": "your-admin-password"
}
```

| Key | Description |
|---|---|
| `adminPassword` | Password for the admin panel at `/admin` |

---

## Admin Panel

Accessible at `/admin` (requires `adminPassword` from config):

- View all registered users
- Edit stats (XP, wins, losses, play time, etc.)
- Reset passwords
- Rename users
- Upload or delete avatars
- Delete accounts

---

## Project Structure

```
server.js              Express + Socket.IO server
node_src/
  UserDB.js            SQLite user/session/stats/achievement queries
  AchievementsService.js  Achievement trigger logic and unlock dispatch
  achievements_data.js    Achievement and challenge template definitions
  GameServiceFactory.js   Room/game lifecycle
  GameRulesModel.js       Core UNO rules engine
  UNOGameService.js       Per-room game state and socket handling
  AIStrategy.js           AI player decision logic
src/
  clientApp.vue          Root app (socket, scale-to-fit, session kick overlay)
  UnoGame.vue            Main game view (lobby, board, panels)
  components/            All UI panels and game components
  lang/                  23-language JSON translation files
  sound.js               Howler.js audio wrapper
  panelManager.js        Reactive panel registry (Vue.observable)
public/
  img/                   Card faces, table backgrounds, achievement icons
  snd/                   Sound effects and music
data/
  users.db               SQLite database (auto-created)
  avatars/               User avatar PNGs
```

---

## Socket Events (summary)

### Client → Server
| Event | Description |
|---|---|
| `login` | Authenticate with token |
| `create` | Create a new room |
| `join` | Join an existing room |
| `placeCard` | Play a card |
| `drawCard` | Draw from deck |
| `callUno` | Declare UNO |
| `punishPlayer` | Punish a player for missed UNO call |
| `changeRule` | Switch ruleset (host only) |
| `restart` | Restart the match (host only) |
| `chat` | Send a chat message |
| `jukeboxChange` | Change music track |

### Server → Client
| Event | Description |
|---|---|
| `gameState` | Full game state update |
| `achievementUnlocked` | Achievement toast payload |
| `xpAwarded` | XP/level-up notification |
| `challengeCompleted` | Challenge completion notification |
| `chatReceived` | Incoming chat message |
| `kicked` | Session displaced by another login |

---

## BUGS
Oh there are... a LOOOOOOOOOOOT XD

## License

This project is derived from [houseofbits/nodejs-uno-game](https://github.com/houseofbits/nodejs-uno-game).  
UNO is a trademark of Mattel. This is a fan/educational project.
