# Handoff: planning conversation, compiled

Compiled on 2026-11-15 from the chat where Family Town was planned and phase 1 was built. Use it as the starting context in Claude Code.

## 1. Who it is for

- Jerry (Malaysia, technical background) is building a game for his two kids: a girl aged 8 and a boy aged 6. Both like Roblox.
- The kids play on Honor kids tablets (Android). Parents want to play with them, so it is a family game.
- The family uses English, Chinese and Malay; the game should help the kids learn all three.

## 2. How the requirements evolved

1. **Start:** "make a game for my kids, they like Roblox." Roblox Studio was suggested, but it needs a PC and does not run on the tablet.
2. **Switch 2:** not possible. Roblox is not on Switch 2, the console has no usable browser, and publishing needs Nintendo developer approval. Dropped.
3. **Web game vs APK:** web game chosen (no install, instant updates). An APK wrapper stays a later option.
4. **First concept:** a 3-in-1 platformer (Candy Island, Dino Adventure, Space Base) with UI mockups. Jerry judged it "not attractive to them at all", so it was replaced. The mockups still exist as a design canvas in Claude ("Kids 3-in-1 Game – UI Designs") and set the visual style.
5. **Learning:** must cover maths, reading, colouring/creativity, and English + 中文 + Malay. Language learning must be part of the gameplay, not a "switch language" setting.
6. **Saving:** kids must be able to resume. No database wanted.
7. **Hosting:** the game files stay on Jerry's laptop; tablets connect to the laptop over home Wi-Fi by IP and port.
8. **Game types wanted:** pet raising (养宠物), Monopoly (大富翁, several players at the same time), drawing, escape room, and more creativity games. **All must be played together**, and on any map the players must see where the others are.
9. **Family play:** parents join as players; gameplay should include them.
10. **Design games:** princess dress-up (公主扮美美) for the girl, car / race-car design for the boy. Both are open to every player.
11. **Release control:** a merge or deploy must not disturb a game in progress.
12. **Auto refresh:** pages must reload themselves when there is a new release.
13. **Location:** all code, docs and assets live in `D:\Workspace\Family` on the laptop.

## 3. Decisions

| Topic | Decision |
|---|---|
| Shape of the game | One shared town (hub). Each building is a game everyone enters together. Stars are the shared currency. |
| Multiplayer | The laptop is the server (Node.js + `ws`). Pure tablet-to-tablet P2P was rejected as fragile on home Wi-Fi. |
| Client | Plain HTML5 Canvas + vanilla JS, no build step, 2D cartoon style drawn in code. |
| Saves | JSON file on the laptop (`data/live/save.json`), keyed by player name. Survives cleared browsers and IP changes. |
| Languages | Words always shown in English, 中文 (Simplified) with pinyin, and Malay. Read-aloud uses the tablet's text-to-speech. |
| Releases | `dev/` -> `release` -> frozen `releases/vN` -> live server restarted by hand when nobody is playing. |
| Auto refresh | The page remembers its version; if the server reports another one (on reconnect, or a 20 s check on the join screen) it reloads and rejoins by itself. |
| Ports | Live 3000, dev 3001. |

## 4. What is built (phase 1, release v1)

- **Join screen:** name, colour, hat, "I am a grown-up" (taller avatar). Name and look are remembered on the device.
- **Town:** 2400 x 1600 map, camera follows the player, floating touch joystick (drag anywhere on the map) or arrow keys / WASD. Positions sync 12 times a second. Up to 8 players.
- **Stars:** 9 stars spawn around town. Collecting one gives +1 star and a word card in three languages (tap to hear it).
- **Family jar:** all stars add up; goals at 25 (fountain), 60 (balloons), 120 (rainbow), 200 (trophy) add decorations to the town.
- **Emotes:** six emoji shown above the avatar.
- **Tag:** started in the playground, needs 2 players, 90 seconds, touching passes "it", everyone who is not "it" at the end gets 3 stars. Cars are switched off during tag.
- **Art Studio:** shared drawing paper (10 colours, 3 sizes, eraser, two-tap clear), "Hang in Gallery", and a guessing game: one player draws a word, the others pick it from four three-language options (2 stars first try, 1 after a miss, 1 to the drawer per correct guess), 75 s rounds, drawer rotates.
- **Gallery:** the last 40 saved pictures with the artist's name.
- **Dress-Up** (`design-dress.js`, `window.DressDesigner`): hair, hair colour, skin, crown/tiara/bow/flower, six dress styles, colours, wings/cape, wand/flower/teddy, shoes. The outfit becomes the avatar in town.
- **Car Garage** (`design-car.js`, `window.CarDesigner`): six bodies, colours, stickers, wheels, spoiler, race number, extras. A car button in town gets in or out; driving is faster than walking.
- **Coming-soon buildings** already on the map: Pet Home, Monopoly, Escape Room.
- **Tooling:** `tools/run.js`, `tools/release.js`, `start-live` / `start-dev` / `release` scripts for Windows, macOS and Linux.

### Protocol (WebSocket, JSON, field `t`)

- Client -> server: `join`, `move`, `room` (town / studio), `emote`, `look` (outfit and/or car), `drive`, `draw`, `clear`, `guessStart`, `guessStop`, `guessTry`, `tagStart`.
- Server -> client: `welcome` (id, version, world, stars), `err`, `players` (list + family total), `state` (positions), `stars`, `card`, `toast`, `emote`, `tag`, `strokes`, `draw`, `clear`, `guess`.
- HTTP: `GET /api/status` (version, players online), `GET` / `POST /api/gallery`, `GET /gallery/<file>`.

## 5. Tested / not tested

Tested in a cloud Linux sandbox with headless Chrome and two or three simulated players: join, movement sync, building doors, shared drawing, a full guessing round, gallery save, dress-up and car saved and visible to the other player, driving, tag hand-over (by direct WebSocket test), reconnect after a server restart, release while players are online, rollback, and auto-reload plus auto-rejoin on a new release.

**Not tested yet:**
- Running on Windows at all (`.bat` files, firewall prompt, Node on the laptop).
- The Honor kids tablets: browser support, parental controls blocking the address, performance.
- The touch joystick and touch drawing (tests used keyboard and mouse).
- Text-to-speech voices; Malay depends on the tablet (falls back to an Indonesian voice if only that exists).
- More than three players at once.

## 6. Known gaps and small to-dos

- No way to take an outfit off and go back to the block avatar.
- No collision between players, trees or decorations; only buildings block movement.
- Movement and star collection trust the client (fine for a home LAN).
- Gallery keeps 40 entries in the list; older image files stay on disk.
- A reload for a new release lands the player back at the town centre, and a round in the studio is lost.
- No sound effects or music.
- `family-town-v1.zip` next to the project folder is a leftover copy and can be deleted.
- The folder is not a git repository yet. `git init` is a sensible first step in Claude Code; `.gitignore` is already there.

## 7. Backlog, in the agreed order

1. **Try phase 1 on the real tablets** and fix what breaks.
2. **Pet Home (养宠物):** hatch, feed, wash and dress pets; pets follow the player in town; visit each other's pet rooms. Learning: pet and food names in three languages; hatching answers a word question.
3. **Monopoly (大富翁):** several players at the same time, each on their own device, one shared board; buying shops, paying rent. Learning: money maths (adding, subtracting, change).
4. **Escape Room:** co-op puzzles where each player sees different clues and has to talk. Learning: word, number and pattern locks.
5. **Build Plot:** decorate a house and garden with stars. Learning: shop prices.
6. **Car racing** in or next to the playground, using the designed cars.
7. Ideas raised but not scheduled: a shop that spends stars, avatar accessories bought with stars, daily gift / lucky spin, sticker album, boss levels, two difficulty levels (easier for the 6-year-old, harder for the 8-year-old), a "save code" to move progress, wrapping the web game as an APK, moving the server to a cloud host so the laptop need not stay on.

## 8. Since the handoff (state on the evening of 2026-11-15)

Sections 4 to 7 describe release v1. This is what changed in Claude Code on the same day.

- **Git and Windows.** The folder is a git repository. The game runs on the Windows laptop, including `start-live.bat`.
- **v2:** pinyin is drawn in the device font, because Fredoka misdraws `ī`.
- **v3 (live):** the growth system (levels, daily quests, daily chest, shop inside Dress-Up and the Car Garage), synthesised sound and music, and the town redrawn in 2.5D (`scene.js`).
- **After v3, in `dev/` and committed, not released:**
  - Word learning removed at the owner's request: no word card or read-aloud after a star, no "listen to words" quest. Three-language names stay on quests, shop items and the guessing game. Maths stays inside play.
  - Games are now plug-in modules (`docs/GAME-MODULES.md`): `dev/games/<id>.js` + `dev/public/games/<id>.js`.
  - The town is 1000 wider, with four new buildings on the east side.
  - Seven games, each built by its own agent and reviewed afterwards: Pet Home, Race Track, Obby Tower, Monster Cave, Monopoly, Escape Room, Home Street. `docs/GAME-PLAN.md` says what each one is.
- **Tested:** each game has a protocol test of its own (63 to 146 checks, all passing with every game loaded), and each was opened and played briefly in a desktop browser at 1280x800, some also at 800x480.
- **Not tested:** anything on the real Honor tablets (touch, speed, sound), a full session of every game from start to finish by real people, more than a few simulated players at once, and how the star rewards of seven games balance against the shop prices.
- **Known small problems reported by the builders:** crowded name tags with five or more players at 800x480 (Escape Room, Race Track); the BOOST button covers the end of the two near lanes at 800x480; solo Monopoly with two robots lasts about 5 minutes; dragging items by touch in Home Street must start sideways (tap-then-tap always works); in Pet Home at 800x480 an open panel covers most of the Back to town button (the panel has its own close button).
- The backlog in section 7 is done except the unscheduled ideas in item 7.
- **v4 (released):** everything in the list above.
- **v5 (released, live):** pinch zoom of the town and the town map (`map.js`): mini map, big map with each person's area, guide arrow.

### Three games made deeper (2026-11-16, in `dev/`, see git log for whether it is released)

After a day of play the owner asked for more: "12 level is not enough" and more modes in the tower, "monopoly too simple", and racing that is "only straight lane".

- **Obby Tower:** 30 stages per tower in five chapters, plus Race, Rising lava and a daily Endless tower; the edge panel scrolls the view and follows other players (the owner asked to be able to check the others' progress). Old best times are kept as the record for stages 1 to 12.
- **Monopoly:** the old game stays as the Quick game; a Big game adds a 36-space board, two dice, building levels, auctions, swaps, mortgages, card decks and town events.
- **Race Track:** circuit racing from behind the car with bends, items, drifting, Grand Prix and Time Trial; the old sprint stays as the Sprint mode.
- Each was built by its own agent in its two module files only. Tests: obby 131 checks, monopoly 359, race 177, all passing; the new code was also run against a copy of the live save and every record survived.
- Reviewed in a desktop browser. Not seen on a tablet, and no full game or Grand Prix was played by a person. Known: robots in the Big game propose only one kind of swap; the Nap corner sits 10 spaces from Start; with gentle robots and Easy steering the race is very easy.

### A boy in Dress-Up (finished 2026-11-16, in `dev/`, see git log for whether it is released)

The owner asked for a boy to choose in Dress-Up. The work was paused once on his request and resumed the next day.

- `dev/shop.js` has the boy's paid items; `FREE.outfitBoy` is the boy's free fallback look, used by `enforce` in `dev/server.js` when an outfit has `body: 1`; `game.js` shows boy items on the boy in the level-up card.
- `dev/public/design-dress.js` draws the boy and has the Girl / Boy switch. A test recorded the canvas calls of 1290 old designs before and after: none differ, so saved outfits look as before.
- Looked at in a desktop browser at 1280x800 and 800x480 (all outfits, hair and items on both bodies, the switch, trying on and buying). Not seen on a tablet.
- **What it does:**
  - New design key `body`: 0 girl (also when missing), 1 boy. Same proportions and anchor points as the girl.
  - Appended option values, never renumbered: `hair` 6 Short, 7 Spiky, 8 Side part, 9 Curly top, 10 Buzz cut, 11 Quiff; `dress` 6 T-shirt and shorts, 7 Hoodie and jeans, 8 Football kit, 9 Superhero suit, 10 Knight armour, 11 Astronaut suit; `head` 6 Cap, 7 Knight helmet, 8 Headphones; `back` 4 Backpack, 5 Jetpack; `item` 5 Football, 6 Sword, 7 Toy robot.
  - `defaults(1)` gives the boy starter look from free options only: hair 6, dress 6, head 0, back 0, item 5.
  - A Girl / Boy switch at the top of the designer applies that body's starter look; each list shows the chosen body's typical options first; "Surprise me" picks from them. All options stay open to both bodies.
  - Every existing option must draw exactly as before (saved outfits), and the shop logic in the file must keep working.

### Rocket Base (2026-11-16, in `dev/`, see git log for whether it is released)

The owner asked for an original game of the "talk it through" kind: the one who can press the controls cannot see what they mean, and the ones who know cannot press. The theme is a rocket launch. Nothing is taken from an existing game and nothing blows up: a wrong press is a spark that costs seconds, and out of time means the launch is postponed.

- **Parts:** Hands presses but sees only grey shapes, Eyes sees the real panel but cannot press, Book has the picture rules of the mission. The server sends each tablet only what its part may know and checks every press.
  - One player trains alone (double countdown, half the stars). Two share: Hands, and Eyes + Book on two tabs. Three have one part each. Four to eight split Eyes by colours / symbols / numbers / lights and Book by chapter.
  - Parts rotate every mission (never the same Hands twice running) and can be asked for in the lobby. A leaver's part is dealt again at once; a late joiner watches until the next mission.
- **Content:** 18 missions (Moon, Mars, Saturn) made of 1 to 6 stations from nine kinds with new values every time, a mission of the day, three medals, best times, a family board, a signal board of picture buttons, and quiet missions where one part may only use the signal board (+2 stars).
- **Maths inside play:** counting drops per colour, adding symbol values for a dial, switching on cells that add up to a target, odd / even / bigger / smaller, weighing crates against barrels.
- **Stars:** 4 to 12 by the number of stations, a medal bonus, a bonus for the first launch of a mission. Five repeat launches a day pay in full, then 1 star. Daily quests `rocket.launch` and `rocket.team`.
- **How it is built:** `dev/games/rocket.js` and `dev/public/games/rocket.js`, by one agent. The core got only the building (west end of the main street), the id in `GAMES`, the icons and the script tag. Saved under `profile.rocket` and `save.rocket`.
- **Tests** (scratch scripts, not in the repository): 794 checks against a mock api, 16,000 random steps with about 100,000 invariant checks, a protocol test over real sockets with 53 checks. Every message to every simulated tablet was scanned: nothing of Eyes or Book reached a Hands tablet and no answer left the server. The committed copy was also run against a copy of the live save: every record survived and all eight games opened.
- **Looked at** in a desktop browser at 1280x800 and 800x480 with two tabs: one whole mission played (a wrong press, then lift-off and the stars), a second one started. **Not tried:** real tablets and touch, sound, three or more real players, most station kinds at the higher levels. Known: with 7 to 8 players the 800x480 lobby scrolls slightly, a running mission is lost if the server restarts, there is no hint system, the Saturn countdowns are untuned.

## 9. Practical notes

- One-time setup on the laptop: install Node.js LTS, allow Node through Windows Firewall on Private networks, reserve a fixed IP for the laptop in the router.
- `start-live` prints the address for the tablets (`http://<laptop-ip>:3000`).
- Back up by copying `data/live`.
- The word list is `dev/words.js`, one line per word: picture, English, 中文, pinyin, Malay.
