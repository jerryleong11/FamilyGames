# Family Town: architecture

## Tech stack and why

| Part | Choice | Why |
|---|---|---|
| Server | Node.js, one file (`server.js`) | Runs on the laptop with one command; one process serves pages and syncs players |
| Real-time sync | WebSocket via the `ws` package (only dependency) | Reliable on home Wi-Fi; simpler than tablet-to-tablet P2P |
| Client | Plain HTML5 Canvas + vanilla JS, no framework | Works in the tablets' browser, nothing to install |
| Build step | None | Edit a file, refresh the page |
| Saves | One JSON file plus PNG files on the laptop | No database to run; easy to back up by copying a folder |

Positions are trusted from the clients (family LAN). The server owns everything that scores: stars, tag, the guessing game.

## Folder layout

```
family-town/
  dev/               working copy of the game (never played by the kids)
    server.js        game server
    words.js         word list (EN / 中文 / pinyin / BM)
    public/          index.html, style.css, game.js
  releases/v1, v2..  frozen copies made by the release tool (+ version.json)
  live.json          which release the kids' server runs: {"version":"v3","previous":"v2"}
  data/live/         kids' saves and gallery (never touched by a release)
  data/dev/          separate test saves for the dev server
  node_modules/ws    shared by dev and every release (Node looks upward for it)
  tools/run.js       starts a server:  live -> port 3000,  dev -> port 3001
  tools/release.js   release, --rollback, --status
  start-live / start-dev / release   (.bat for Windows, .command / .sh for Mac and Linux)
  docs/, assets/
```

## Dev -> release -> live

1. **Edit** in `dev/`. Test with `start-dev` on port 3001, using `data/dev`.
2. **Release** with `release`. The tool copies `dev/` to `releases/vN` (skipping `data` and `node_modules`), writes `version.json`, runs `node --check` on the server code, and only then points `live.json` at `vN`. If the check fails, live is unchanged.
3. **Go live** by restarting `start-live`. A running live server keeps the code and pages of the release it started from, so a release never changes a game in progress. The release tool reports who is online so you can wait.
4. **Rollback** with `release --rollback`: `live.json` swaps `version` and `previous`. Restart `start-live`.

Saved data is outside the release folders, so every version reads the same saves. New versions must stay able to read older `save.json` files (add fields; do not rename or remove them).

### Version check

The server sends its version in the `welcome` message. When the live server restarts, each tablet reconnects by itself; if the version differs from the one its page was loaded from, the page reloads to pick up the new files.

## HTTP endpoints

| Path | Use |
|---|---|
| `/` and static files | Game pages from `public/` |
| `GET /api/status` | `{version, players, names}`; used by the release tool |
| `GET /api/gallery` | List of gallery pictures, newest first |
| `POST /api/gallery` | `{name, img}` (PNG data URL) hangs a picture |
| `/gallery/<file>.png` | A gallery picture |

## WebSocket messages (JSON, field `t` is the type)

Client to server:

| `t` | Meaning |
|---|---|
| `join` | name, colour, hat, grown-up flag; loads or creates the profile |
| `move` | x, y, facing, moving; sent about 12 times a second in town |
| `room` | enter `town` or `studio` |
| `emote` | show an emote above the avatar |
| `draw`, `clear` | a batch of stroke points on the shared paper; wipe the paper |
| `guessStart`, `guessStop`, `guessTry` | control the guessing game; pick option `i` |
| `tagStart` | start tag from the playground |
| `look`, `drive` | (being added) save an outfit or car design; get in or out of a car |

Server to client:

| `t` | Meaning |
|---|---|
| `welcome` | your id, server version, the world (buildings, playground, goals), stars on the map |
| `err` | join refused (name in use, town full) |
| `players` | everyone's name, look, stars and room, plus the family star total |
| `state` | positions of all players in town, 12 times a second |
| `stars` | current stars on the map |
| `card` | the word card for the player who collected a star |
| `emote`, `toast` | an emote; a short notice |
| `strokes`, `draw`, `clear` | the studio paper: full history on entry, then live updates |
| `guess` | guessing-game state, different per player (drawer sees the word, others see four options) |
| `tag` | whether tag is on, who is "it", time left |

## Save file (`data/live/save.json`)

```json
{ "profiles": { "mia": { "name": "Mia", "stars": 12, "color": "#FF8FB8", "hat": 2, "big": false } },
  "family": 37,
  "gallery": [ { "file": "1794725000000.png", "name": "Mia", "ts": 1794725000000 } ] }
```

Profiles are keyed by lower-case name. Written at most about once a second, through a temp file so a crash cannot leave a half-written save.

## Limits

- Up to 8 players.
- LAN only, plain `http`. No accounts or passwords: anyone on the home Wi-Fi can join.
- The laptop must stay on and awake while playing.
