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
- **v5 (released):** pinch zoom of the town and the town map (`map.js`): mini map, big map with each person's area, guide arrow.
- **v6 (released 2026-11-16):** the three deeper games and the boy in Dress-Up (both below).
- **v7 (released 2026-11-16, live from the next start of the live server):** Rope Team in the Obby Tower, the version label and Rocket Base (all below). The frozen copy was run against a copy of the live save: every record survived and all eight games opened. Not yet played on the tablets.
- **v8 (released 2026-11-16, late evening):** the Rocket Base cards with a Captain, and in the Obby Tower the rope size with two teams, the rebuilt Hard Tower and the Dragon Tower (all below). The frozen copy was run against a copy of the live save: stars, shop items, looks and reached flags unchanged for all three players, their old Hard times and the three old Hard board rows set aside under `old.hard.v1`, all eight games opened. A copy of the save from just before the first start of v8 is kept on the laptop as `data/backup-before-v8/save.json` (ignored by git, like every save). Do not roll back to v7 without need: v7 would put times made on the old Hard layouts into the fresh Hard fields. Not yet played on the tablets.

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

### Rope Team in the Obby Tower (2026-11-16, in `dev/`, see git log for whether it is released)

The owner sent a video of a co-op climbing game in which the players are chained to each other and asked what could be made of it. The answer was an original mode for the existing tower; only the idea of being tied together is used, no name, look, setting or level piece of that game.

- **What it is:** a fifth tab at the tower entrance, "🤝 Rope". Two to four climbers who pressed Ready are tied in a line and climb one chapter (six flags) of the Easy or the Hard tower as one team. Alone the card is grey: it takes two. (Since then: a rope size, two teams that the players pick themselves, and a third tower. See "Obby Tower: rope teams, a harder Hard Tower, the Dragon Tower" below.)
- **Rules:**
  - A flag is the team's only when everybody on the rope stands on it at the same time (dots over the next flag show who is there). The server decides this.
  - Whoever falls hangs on the rope. They get up again by tapping jump (climbs the rope), by a teammate holding **Pull**, or by a teammate walking away from the edge (the rope runs over the platform edge).
  - The weight of somebody hanging drags whoever stands above toward the edge; **Hold** plants the feet.
  - When the whole team is under its last flag, everybody goes back to that flag together. Nothing else is lost. Things that hurt knock a roped climber over instead of sending them to a flag.
  - A tablet that drops off the Wi-Fi is untied at once and tied in again if it comes back while the round is on; with one climber left the round waits 12 s, then ends and pays.
  - The rope lets go at a door until the two are together again, gives extra length after a bounce pad, and is 1.5 times as long in the space chapter. No stage was changed or left out.
- **Stars:** Easy 1 per team flag and 3 for the top of the chapter, Hard 2 and 3; four paid rounds a day. A daily quest counts team flags (not a solo quest). The family board keeps the best team time of each chapter; a chapter is open when the player or any rope team has reached it.
- **Maths inside play:** the screen shows the height of the lowest climber and the metres to the next flag; a team flag shows the sum of the heights (`0 m + 37 m = 37 m`).
- **How it is built:** in `dev/games/obby.js` and `dev/public/games/obby.js` only. Each tablet works out the pull of the rope on its own climber from what it hears of its neighbours (`ropeBefore` / `ropeAfter` beside `step`); the server passes roped positions on at once instead of ten times a second. The other ways to play are simulated exactly as before (checked against the released file).
- **Tests** (scratch scripts, not in the repository): two and three simulated tablets on the rope with network delay, 41 checks; a protocol test with up to four players, 80 checks; the earlier Obby protocol test, 131 checks; every one of the 60 stages with a roped pair, using the earlier stage solver. All passing.
- **Looked at** in a desktop browser at 1024x600 and 800x480 with a scripted second climber. **Not tried:** real tablets and real fingers, the children, four climbers at once, the Hard tower and the space chapter in a browser. The feel is tuned in simulation only; the numbers to change are `ROPE` in the client file (length 220, stretch 60, how hard weight drags, pull speed) and `ROPE_PER_DAY` and the `rope` pair in `TOWERS` in the server file.

### A version label on the tablets (2026-11-16, in `dev/`, see git log for whether it is released)

The owner asked to see on the tablet whether it runs the latest deployment.

- A small label in the bottom left corner of the join screen and the town (not inside the games): the version and when it was released, with a tick, for example `v7 · 16 Nov 10:52 ✓`.
- It turns amber when the tablet is not on the newest: `⚠ v8 is ready: restart start-live` (a release was made or rolled back, the live server still runs the old one). On the test copy (port 3001) it shows `dev`, the time of the last file change and the live release, and warns `server files changed: restart start-dev` or `page files changed: reload this page`.
- How: `/api/status` also returns `released`, `latest` (from `live.json`), `started`, `srv`, `pub`; `showVersion` in `game.js` draws the label from the status check that already runs every 20 s. Files: `dev/server.js`, `dev/public/game.js`, `index.html`, `style.css`.
- Tested on scratch copies (a test copy and a pretend release) on private ports and in a desktop browser. A release made before this change shows no label: it appears from the next release on.

### Rocket Base (2026-11-16, in `dev/`, see git log for whether it is released)

The owner asked for an original game of the "talk it through" kind: the one who can press the controls cannot see what they mean, and the ones who know cannot press. The theme is a rocket launch. Nothing is taken from an existing game and nothing blows up: a wrong press is a spark that costs seconds, and out of time means the launch is postponed.

- **Parts:** Hands presses but sees only grey shapes, Eyes sees the real panel but cannot press, Book has the picture rules of the mission. The server sends each tablet only what its part may know and checks every press.
  - One player trains alone (double countdown, half the stars). Two share: Hands, and Eyes + Book on two tabs. Three have one part each. Four to eight split Eyes by colours / symbols / numbers / lights and Book by chapter. (From three players on, the parts are now cards with talk rules and there is a Captain: see the next section.)
  - Parts rotate every mission (never the same Hands twice running) and can be asked for in the lobby. A leaver's part is dealt again at once; a late joiner watches until the next mission.
- **Content:** 18 missions (Moon, Mars, Saturn) made of 1 to 6 stations from nine kinds with new values every time, a mission of the day, three medals, best times, a family board, a signal board of picture buttons, and quiet missions where one part may only use the signal board (+2 stars). (The signal board and the quiet missions changed too: next section.)
- **Maths inside play:** counting drops per colour, adding symbol values for a dial, switching on cells that add up to a target, odd / even / bigger / smaller, weighing crates against barrels.
- **Stars:** 4 to 12 by the number of stations, a medal bonus, a bonus for the first launch of a mission. Five repeat launches a day pay in full, then 1 star. Daily quests `rocket.launch` and `rocket.team`.
- **How it is built:** `dev/games/rocket.js` and `dev/public/games/rocket.js`, by one agent. The core got only the building (west end of the main street), the id in `GAMES`, the icons and the script tag. Saved under `profile.rocket` and `save.rocket`.
- **Tests** (scratch scripts, not in the repository): 794 checks against a mock api, 16,000 random steps with about 100,000 invariant checks, a protocol test over real sockets with 53 checks. Every message to every simulated tablet was scanned: nothing of Eyes or Book reached a Hands tablet and no answer left the server. The committed copy was also run against a copy of the live save: every record survived and all eight games opened.
- **Looked at** in a desktop browser at 1280x800 and 800x480 with two tabs: one whole mission played (a wrong press, then lift-off and the stars), a second one started. **Not tried:** real tablets and touch, sound, three or more real players, most station kinds at the higher levels. Known: with 7 to 8 players the 800x480 lobby scrolls slightly, a running mission is lost if the server restarts, there is no hint system, the Saturn countdowns are untuned.

### Rocket Base: one power each, and a Captain (2026-11-16, in `dev/`, see git log for whether it is released)

The owner's words: "which person can talk, can see, can choose word to send, when 3 persons in game. the 4th person choose who turn to action, can advise". He was shown three readings of that and chose the strict one, "one power each".

- **Cards from three players on** (one and two players play as before):
  - 🗣 **Talker** (was Book): has the rule book and is the only one who may talk.
  - 👀 **Seer** (was Eyes): sees the real panel and is silent. Shows what they see with picture chips (colour, symbol, number, arrow, yes / no, planet) and can point at a control: a ring on the other tablets that gives away nothing of the control.
  - 💬 **Sender** (was Hands): presses the controls and is silent. Sends ready-made words (Which one? Again, Wait, Done, Faster, Help, yes / no, 1 to 6), each an icon with the three languages as small labels.
  - 🧭 **Captain** (four or more players): turns the crew to a station and gives the turn to press to a Talker, a Seer or the Sender, also in the middle of a station. Whoever finished the last station cannot be given the next one. Sees the grey panel, the clock and the message lines, never colours or book pages, and may talk. A turn nobody holds for 6 s is given by the server, so a slow Captain never stops the game.
  - With the turn, a Sender presses on grey shapes, a Talker on grey shapes next to the book, a Seer on the panel they see. Without a Captain the Sender presses everything.
  - Five to eight players: one Captain, one Sender, the rest Seers and Talkers who share the panel and the book as before.
  - The cards rotate every mission (never the same Sender or Captain twice running) and can be asked for in the lobby.
- A tablet cannot stop anybody talking. The card says the rule with a big sign and one line, and the family keeps to it.
- **Message lines:** chips no longer flash and vanish. Each player's chips line up (six at most) on every tablet; a new line starts after 5 s, when the line is full or with the rubber. Lines are wiped when a station is ready or the crew turns to another one.
- **Radio silence:** what a quiet mission is with three or more players. The Talker shows the rules with picture chips too and only a Captain still talks. +2 stars as before. With two players the quiet mission is as it was.
- **Coming and going:** the cards are dealt again whenever somebody enters or leaves. The Captain leaves a crew of four: three cards and the Sender presses. The holder of the turn leaves: the turn is free and the 6 s start. Three become two: the old two-player game.
- **Unchanged:** stars, medals, boards, quests, daily caps and every saved field. The Captain is paid like the crew.
- **Protocol:** new `rocket.turn`, `rocket.point`, `rocket.clear`; `rocket.sig` carries the whole line and has the kinds `p` (planet) and `w` (word); `rocket.state` gained `cards`, `cap`, `turn`, `lines`, `me.C`, `me.T`; `mis.quiet` is `''`, `'E'` (two players) or `'R'` (radio silence). Test hooks `ROCKET_TURN_MS` and `ROCKET_LINE_MS`.
- **Tests** (scratch scripts, not in the repository): 2,160 checks against a mock api, a random run with about 120,000 invariant checks per 16,000 steps, a protocol test over real sockets with 81 checks, the client run headless per tablet with taps at four screen sizes, a start on a copy of the live save, and 27 faults put into the server on purpose (all caught). Every message is checked against what the card of that tablet may know.
- **Looked at:** the builder's 66 pictures from a headless desktop browser (mostly 800x480), and one four-player mission played by hand in four browser tabs at 800x480: the lobby cards, all four views, word and picture lines, pointing, the server giving a free turn, "Not twice in a row!", a Seer and then a Talker finishing a station with the turn, lift-off, and the same 7 stars for the Talker and the Captain. **Not tried:** real tablets and touch, sound, whether 🗣 and 🧭 draw on the kids' tablets (there is a fallback to 👄 and 👑), whether the children keep to "no talking", five or more real players.
- **Known:** at 800x480 with a Captain, radio silence and an open board only three message lines fit; a town toast covers the bottom centre of a board for a few seconds; the briefing text takes two or three lines at 800x480; a line just sent disappears when the station is finished.

### Obby Tower: rope teams, a harder Hard Tower, the Dragon Tower (2026-11-16, in `dev/`, see git log for whether it is released)

The owner's words: "Rope game can add on how many person in group, 2, 3, 4 (max). Also can choose who's the team, max 2 team. user can select the team." and "Obby tower hard mode is not enough hard, enhance it, also add on Hell mode (difficult than hard, you name it)". The name chosen for the third tower is Dragon Tower.

- **Rope size and two teams:**
  - Whoever opens a round picks the tower, the chapter and the rope size (2, 3 or 4 climbers on one rope). The size can be changed while the round gathers, never below a team that is already bigger.
  - There are two ropes, 🔴 Red Rope and 🔵 Blue Rope. Everybody taps the one they want and can switch or step out until the countdown ends. A rope is full at the rope size.
  - A rope needs two climbers. The countdown runs only while no rope has just one; it is 5 s, or 1.5 s when everybody at the entrance has a rope or both ropes are full. One rope alone is the game as it was.
  - With two ropes it is a race on the same chapter: each rope is tied only to its own climbers and has its own flags, its own "everybody back to the flag", its own falls and its own time. The first rope at the top wins and each of its climbers gets +2 stars (only on a round that counts toward the four paid rounds a day). The other rope has 90 s more.
  - The other rope is on screen, fainter, with rope and name tags in its colour; there is no pull or push between ropes. Looking around while roped works now (the game keeps running meanwhile).
  - A rope left with one climber ends after 12 s as before and the other rope carries on.
- **Hard Tower, layout 2:** all 30 stages rebuilt at the same heights. Gaps need the second jump in the air, stones are 60 to 80 wide, and there are two new things: slabs that crumble 0.55 s after you land, and spikes that come out on a rhythm. The Easy tower and the Endless tower are unchanged (checked against v7).
  - **Old Hard times** were set on the easier layouts and are set aside, not deleted: `profile.obby.old.hard.v1` (`best`, `full`, `ch`, `ghost`, `lava`) and `save.obby.old.hard.v1` (the board rows), marked by a layout number (`LAYOUT` in the server file). The Hard times and boards start empty. Reached flags, stars and everything paid stay. The move runs at server start and again per profile, and is safe to repeat.
  - **Careful with a rollback:** a release older than this one does not know the layout number. If v7 runs again after this has been live, times made on the old layouts go into the new fields.
- **Dragon Tower** 🐉 (龙塔, Menara Naga), tower id `dragon`: a third tower above Hard, open to everybody, 30 stages in five chapters (Volcano, Fire Cave, Crystal Cave, Storm, Dragon's Nest), playable in Climb, Race, Rising lava and Rope. Everything the Hard Tower has, tighter (stones 50 to 60 wide, gaps 200 to 205, slabs crumble after 0.4 s), plus fire jets that sputter first, ember stones that go out and come back, and lava pools that rise and sink. Its own look, with a dragon on top whose eye follows the climber. The tower cards and pickers show 🔥 / 🔥🔥 / 🔥🔥🔥.
  - **Stars:** a new flag 3 (Hard 2), chapter chests 12, 20, 16, 18, 20 (the builder had 30 and 21 in there; cut to the 20 that `GAME-MODULES.md` allows for a one-off), a repeated chapter 6, race 9 / 5, lava 1 per flag, rope 3 per team flag and +4 at the top. Every daily cap is as before.
- **How hard, in numbers:** a simulated player whose key presses are 45 ms off needs this many tries per stage (median): Easy 1.2, the old Hard 2.3, the new Hard 3.9, Dragon 4.4. The measure hardly feels how wide a gap is, so it understates the Dragon Tower; nobody has played either tower by hand. If the Dragon Tower turns out too close to Hard, the stage tables are in `dev/public/games/obby.js` and the heights must stay equal to `h` in `TOWERS` in `dev/games/obby.js`.
- **How it is built:** `dev/games/obby.js` and `dev/public/games/obby.js` only. One list of towers on each side (`TOWERS`, `TOWER_IDS`). New messages `obby.size` (in) and `obby.te` (a rope is done); `obby.ready` carries `team`; `tf`, `tr`, `run`, `rk`, `pt`, `res` carry the teams.
- **Tests** (scratch scripts, not in the repository): a protocol test with 228 checks (the 131 earlier ones plus team picking, full ropes, switching, a rope of one blocking the countdown, separate flags, the winner and its bonus, a disconnect in each rope, the Dragon Tower in all four ways to play, the caps); 43 checks on a copy of the live save (three players' old Hard times and three board rows moved, a second start changes nothing, half-old and damaged saves load); 14 checks of two roped tablets on crumbling slabs, ember stones and spikes; every one of the 60 Hard and Dragon stages has a way up for the stage solver and every flag is safe to stand on.
- **Looked at:** the builder's pictures from a headless desktop browser, and by hand in four browser tabs at 800x480: the three tower cards, the Rope lobby, two against two picking Red and Blue, the countdown, both ropes on screen from both sides, leaving a round, and the start of a Dragon Tower climb. **Not tried:** real tablets and touch, a rope round climbed by hand to the top, three or four on one rope in a browser, most stages, the Dragon Tower in a lava round or a race. The lava speeds of the Hard and the Dragon tower are guesses.
- **Known:** a slab crumbles on each tablet on its own, so a teammate can be seen standing on one that is gone on your screen; the rope buttons Join / Switch / Leave / Full are English only, like Ready! before.

### Who is playing: a level per player (2026-11-18, in `dev/`, see git log for whether it is released)

The owner asked which games could be made deeper so that they suit the children and still challenge the adults. The answer started with one thing every game can use: each player says who they are, and a game gives each tablet its own difficulty in the same round. He chose that together with a deeper Monster Cave.

- **Join screen:** the tick box "I am a grown-up" is now three buttons after "I am": 🐣 Little (about 6), 🧒 Big kid (about 8), 🧑 Grown-up. The choice is remembered on the device (`ft_skill`) and sent with `join` as `skill` 0, 1 or 2. A grown-up is still drawn taller (`big`).
- **The first time** a tablet has no choice yet and Play asks for one. A tablet that had the grown-up box ticked is a grown-up without being asked. After the release that brings this, the children's tablets therefore stop once at the join screen: the 6-year-old needs somebody to tap Little with him.
- **Saved** as `skill` in the profile. A page that does not say (an old page, a test) keeps what the profile has; a profile from before is a grown-up if it was drawn as one, otherwise a big kid.
- **For the games:** `p.skill` on the server, `api.players()[id].skill` and `api.self().skill` on the tablets (`docs/GAME-MODULES.md`). Everybody earns the same stars whatever their level. It is called skill in the code because "level" already means the star level.
- **Uses it so far:** Monster Cave (next section). Still to do in the other games: the Race Track (steering help and faster robots), the Escape Room and Rocket Base (who gets the harder clues), Monopoly (robot strength).
- **Tested:** 15 protocol checks on a private server (the three values, old pages, old and damaged saves, a later change) and the join screen by hand in a desktop browser at 800x480. Not tried on a tablet. At 800x480 the join card was already a little taller than the screen and scrolls, as before.

### Monster Cave: numbers of your own size, six bosses, roles (2026-11-18, in `dev/`, see git log for whether it is released)

The first game that uses the level per player. Before, the whole team added up to one number on the boss's shield; a grown-up had nothing to think about and a 6-year-old could not follow. Now the shield has one rune per fighter, in that fighter's colour, and the number on it is made for that fighter.

- **The numbers per level** (lowest to highest rune on Easy / Normal / Hard, and how far a bonus rune goes up):

  | | Easy | Normal | Hard | bonus step | never above | how |
  |---|---|---|---|---|---|---|
  | 🐣 Little | 5–8 | 6–9 | 7–10 | +1 | 10 | adding only; dots to count under every orb and in the own sum |
  | 🧒 Big kid | 10–15 | 12–20 | 18–30 | +3 | 30 | adding; minus gems (−1 to −5, at most three on the floor) on Hard |
  | 🧑 Grown-up | 30–54 | 40–72 | 54–99 | +9 | 99 | a times pad, ×1 to ×9 |

  - The orbs (1 to 9) lie on the floor for everybody and are picked up by walking over them. At the cannon a child's orbs go into the child's own sum by themselves. A grown-up's do not: one tap on ×n loads the next orb times n (keys 1 to 9 on a laptop), so 56 is an orb 7 loaded ×8. A grown-up's bonus runes, and half the runes on Hard, are numbers outside the times tables and need two loads (59 = 7×8 + 3).
  - A Little fighter cannot pick up a minus gem or an orb bigger than the own rune (those are faded on that tablet).
  - Once a second the server checks that every fighter's rune can still be made from what that fighter may take, and adds a fitting orb if not.
- **The shot:** the cannon fires when every fighter who is in the cave and awake has lit their rune. Whoever is done early gets a bonus rune one step harder; every bonus rune lit before the shot adds 1 damage, at most 3 (so a shot does 1 to 4). At full power nobody gets another bonus rune, so the fast ones go and help. Boss HP is as before (9 / 8 / 7, plus 3 / 3 / 2 per further fighter).
- **Going over** empties only your own sum. A Big kid or a Grown-up makes the boss angry for 6 s (was 8 s); a Little fighter does not.
- **Nobody holds up the shot:** someone who leaves or loses the connection does not count (the rune is kept if they come back during the same shield). Someone who neither steps nor loads for 20 s is asleep (a z on their rune) and does not count until the next step; without that a tablet left lying in the cave blocked every shot. A late joiner gets a bonus rune at once and a rune of the shield with the next one.
- **Kinder to the little ones:** the boss aims at Little : Big kid : Grown-up as 1 : 2 : 3; a Little fighter keeps the orbs when knocked down; back on the feet nothing hits for 4.5 / 2.5 / 1.5 s. The pace of the attacks follows only the difficulty.
- **Six bosses** (beating one opens the next; a boss can be fought when anybody in the cave has opened it):

  | Boss | Attacks | Twist |
  |---|---|---|
  | Slime King | slime balls, little slimes, a rock | belly slams leave a sticky puddle (half speed) |
  | Rock Golem | beams, boulder lanes, a quake at the cannon, rocklings | the roof comes down: only three green ledges are safe |
  | Fire Dragon | fans of fire, a wall of fire, sprites, a fireball | meteors leave burning ground |
  | Coral Crab (珊瑚蟹, Ketam Karang) | a claw on one side then the other, rows of bubbles with a gap, scuttling shells | the cannon drifts on a raft |
  | Clock Tortoise (时钟龟, Kura-kura Jam) | a clock hand sweeping round, alarm rings with a long fuse, a cog that comes back | every 21 s or so the orbs change places |
  | Storm Owl (风暴猫头鹰, Burung Hantu Ribut) | feathers on every other square then the squares between, whirlwinds, walls of wind | every 17 s or so a gust pushes everybody sideways |

  Every attack is announced first (a red zone, a marked lane). Rolling things and minions are attacks without a red zone, so a fight can go 20 to 40 s without one.
- **Four roles**, picked on a card in the lobby and remembered (`profile.boss.role`); a newcomer gets the role the fewest others have:

  | Role | Button (cooldown) | Without the button |
  |---|---|---|
  | 🛡 Guard | a bubble where they stand, 5 s, nothing hits inside (18 s) | keeps the orbs when hit, down 1.2 s instead of 2 s |
  | 💚 Healer | everybody who is down gets up at once, with the orbs that rolled away; not used up when nobody is down (10 s) | friends nearby are down 1 s, the Healer 1.2 s |
  | 🧲 Collector | pulls the orbs within reach into a ring at the feet (12 s) | carries 5 instead of 3 |
  | ⚡ Runner | a 1.3 s dash that nothing can hit (7 s) | walks 12% faster |

- **Stars:** unchanged per fight (10 / 14 / 18, 3 for a helper who loaded nothing, 2 when the boss escapes, 2 after the fifth win of a day) and the same for every level and role. Six first-win bonuses of 10 instead of three, so 30 more one-off stars per player.
- **Saved:** `profile.boss.w` (wins per boss and difficulty) and `.bt` (best time per boss) grow from three entries to six; `role` is new. Nothing renamed. The released v8 loads such a save and keeps the extra entries (tried).
- **How it is built:** `dev/games/boss.js` and `dev/public/games/boss.js` only. New from the tablet: `boss.role {r}`, `boss.load {m}` (a grown-up's ×m), `boss.act` (the ability). New to the tablets: `boss.lit`, `boss.runes`, `boss.pud`, `boss.wind`, `boss.tw`, `boss.act`, `boss.no`. A rune travels as `[id, number, sum, bonus step, has a rune of this shield, lit, skill, role, asleep]`. The numbers to tune are at the top of the server file: `BAND` (the runes per level), `DIFF`, `KIND`, `ROLE`, `UP_SAFE`, `IDLE_MS`, `BONUS_CAP`. `BOSS_SPEED` (a faster fight clock) and `BOSS_LIMIT_MS` exist for tests only.
- **The lobby** lost its trophy shelf: wins and best time sit on the six boss cards, and a box shows the number range of each level for the chosen difficulty.
- **Tests** (scratch scripts, not in the repository): a protocol test over real sockets with 179 checks (the runes per level and their bands, own sums, the times pad, minus gems, going over, bonus runes and the cap, leaving, coming back, falling asleep, a late joiner, every role, the six bosses and their unlock chain, pay, the daily cap); a run on a copy of the live save (wins, best times and stars unchanged, only the new fields added); the rollback check with v8.
  - Two checks of that test were timing luck and failed when run again for the review; both were the test, not the game. It waited at most 20 s for a red zone (over 72 short fights the boss attacked every 6.4 s on average, but 4 of them had no red zone in the first 21 s), and it reported a hit 50 ms before the server takes one (a tablet reports it half a second later). Both waits were widened.
  - **Can it be won?** With perfect play every one of the 72 cases (six bosses, three difficulties, the three levels alone and a family of four) wins, in 0:18 to 1:34. With slow simulated fighters (four fights per case; how slow a 6- and an 8-year-old really are is the builder's guess, nobody measured):

    | | Easy | Normal | Hard |
    |---|---|---|---|
    | Little alone | 24 of 24, 4:11 | 10 of 24 | 5 of 24 |
    | Big kid alone | 24 of 24, 2:29 | 24 of 24, 3:12 | 16 of 24 |
    | Grown-up alone | 24 of 24, 1:32 | 24 of 24, 1:33 | 24 of 24, 2:10 |
    | Little, Big kid and two Grown-ups | 24 of 24, 3:20 | 23 of 24, 4:08 | 20 of 24, 4:15 |

    In those family fights each child is knocked down about 5 times on Easy, 10 on Normal and 16 on Hard.
- **Looked at:** the builder's pictures from a headless browser at 800x480 and 1280x800 (lobby, each level's fight screen, eight fighters, the signature moves, the shot, the result), and by hand in three browser tabs at 800x480 as Little, Big kid and Grown-up: the lobby with the three ranges, the fight with a rune each, walking, picking up, a grown-up's 1×4 + 6×5 = 34 on the times pad with real taps, the shot, the next shield, the sleepers' z, the Little tablet's dots and faded orbs and its automatic loading.
- **Not tried:** real tablets and touch (thumb reach to the times pad at the top right, the size of the dots for a 6-year-old, speed on the old tablets, whether 🧲 🧒 🧑 exist in the tablets' emoji font), a whole fight played by hand, any real child. The role balance is a guess.
- **Known:** a Little fighter alone is only safe on Easy. A grown-up alone wins in two or three minutes for full stars (the five paid wins a day are the only brake). On Hard everybody is knocked down often. Orbs are still picked up by walking over them, so a grown-up with an unwanted orb in the hands must drop it first. A child's orbs load by themselves, so a wrong orb carried to the cannon goes in and empties the sum. The dot plates under neighbouring orbs can overlap. The times pad uses a CSS grid.

## 9. Practical notes

- One-time setup on the laptop: install Node.js LTS, allow Node through Windows Firewall on Private networks, reserve a fixed IP for the laptop in the router.
- `start-live` prints the address for the tablets (`http://<laptop-ip>:3000`).
- Back up by copying `data/live`.
- The word list is `dev/words.js`, one line per word: picture, English, 中文, pinyin, Malay.
