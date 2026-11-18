# Family Town: game plan

## Who it is for

- Two children (8 and 6) who love Roblox, playing on their own tablets.
- Mum and dad join from a phone or the laptop as players, not as supervisors.
- Everything is played together: in every map area, players see each other move in real time.

## Principles

1. **Together first.** Every activity works with 2 to 8 players and can also be started by one child alone (robots or solo modes fill in).
2. **Maths hides inside play; no word learning.** Prices, sums, counting and change are part of the games, never a quiz that blocks the fun. Word and vocabulary learning (the word cards) was removed at the owner's request on 2026-11-15. Names of quests, items, pets and the guessing words are still shown in English, 中文 (with pinyin) and Bahasa Malaysia, as labels. There is no "switch game language" setting.
3. **Collect, customise, create.** The hooks that make Roblox games sticky: things to earn, a look of your own, things you made on show.
4. **One shared currency.** Stars earned anywhere count everywhere, and feed a family goal.
5. **Short sessions.** Every activity is fun within two minutes.

## The town hub

One small town that everyone walks around. Buildings are doors into games. Closed buildings show "coming soon" so the kids can see what is next.

## Phase 1 (this build)

| Feature | What happens | Learning inside |
|---|---|---|
| Town | Walk around with a joystick, see everyone's avatar and name, send emotes | - |
| Stars | Stars appear around town. Collecting one pops a word card | Picture + English / 中文 pinyin / BM, tap to hear it |
| Family star jar | All stars from all players add up. At 25, 60, 120 and 200 something new appears in town | Counting toward a shared goal |
| Tag | Start in the playground. Whoever is "it" chases the others for 90 seconds; everyone not "it" at the end earns stars | - |
| Art Studio | Everyone draws on one shared paper at the same time | - |
| Guessing game | One player draws a secret word, the others pick the answer from four choices | Choices written in all three languages, with read-aloud |
| Gallery | Hang a finished drawing on the town wall for the family to see | - |
| Dress-Up Boutique | Design your own look: dresses, crowns, wings, colours (princess style and more) | Item names in three languages |
| Car Garage | Design a car or race car (body, colour, wheels, stickers) and drive it around town | Colour and part names in three languages |
| Parents as players | Grown-ups pick a bigger avatar and play every game with the kids | - |

Saves (name, look, car, stars, gallery) live on the laptop, so progress survives a tablet restart.

## What came after phase 1

| Release | What it added |
|---|---|
| v2 | Pinyin tone marks drawn correctly. |
| v3 | **Growth system**: levels from stars earned, three daily quests, a daily chest with legendary finds, a shop inside Dress-Up and the Car Garage. **Sound**: effects and music synthesised in code. **2.5D town**. |
| v4 (built, see `docs/HANDOFF.md` for its state) | Word cards removed. A wider town. Seven games as plug-in modules (`docs/GAME-MODULES.md`), each behind its own building: |

| Building | Game |
|---|---|
| **Pet Home (养宠物)** | Buy eggs, hatch them by earning stars, about 14 pets with rarity, feed / play / wash, pets grow and follow you in town, a collection book, trading. |
| **Race Track** | Circuit racing seen from behind the car on roads that bend and rise: 4 circuits, 3 laps, 8 racers with robots, drifting, item boxes with seven original items, a mini map. Modes: Race, Grand Prix, Time Trial against your ghost, and the original side-view Sprint. |
| **Obby Tower** | A jumping obstacle tower in three versions of 30 stages in five chapters each: Easy and Hard (Garden, Castle, Ice, Clouds, Space; Hard has crumbling slabs and timed spikes) and the Dragon Tower above them (Volcano, Fire Cave, Crystal Cave, Storm, Dragon's Nest; fire jets, ember stones, rising lava pools). Modes: Climb, Race, Rising lava, an Endless tower that is new every day, and Rope Team (two to four climbers tied together by a stretchy rope climb a chapter as one team: a flag counts only when everybody stands on it, and whoever falls hangs on the rope until they climb it or a teammate pulls them up; the players pick a rope size and one of two ropes, Red or Blue, and two ropes race each other). The edge panel shows where everyone is and lets you scroll or follow them. |
| **Monster Cave** | Co-op boss fight where everybody gets numbers of their own size. The boss's shield has one rune per fighter, sized by who is playing: Little 5 to 10 with dots to count, Big kid 10 to 30 (minus gems on Hard), Grown-up 30 to 99 with a times pad (56 is an orb 7 loaded ×8). The number orbs on the floor are shared; carried to the cannon they go into the player's own sum, and when every rune is lit the cannon fires. Whoever is done early gets a harder bonus rune that adds damage. Six bosses with their own attacks and one twist each (Slime King, Rock Golem, Fire Dragon, Coral Crab, Clock Tortoise, Storm Owl), three difficulties, and four roles with one ability each (Guard, Healer, Collector, Runner). |
| **Monopoly (大富翁)** | Quick game: a 24-space town board, one die, 10 rounds. Big game: 36 spaces, two dice with doubles, four building levels, auctions, swaps, mortgages, two card decks, town events, 15 to 30 rounds. Both: robots, paying with notes and getting change. |
| **Escape Room** | Four rooms per run from ten puzzle kinds; each tablet holds different clues, so the family has to talk. |
| **Home Street** | Your own house and garden: buy and place items, visit each other, give hearts. |
| **Rocket Base (火箭基地)** | Get a rocket ready before the countdown ends, by talking: Hands presses the controls but sees only grey shapes, Eyes sees the real panel but cannot press, Book has the picture rules. 18 missions to the Moon, Mars and Saturn made from nine kinds of station, a mission of the day, medals and a family board. One player can train alone. From three players on the parts are cards with one power each: the Talker has the book and is the only voice, the Seer sees the panel and shows it with picture chips and by pointing, the Sender presses and sends ready-made words; a fourth player is the Captain, who gives the turn to press (nobody twice in a row) and may advise. With five to eight players the panel and the book are split further. |

## Ideas not built yet

A shop for avatar accessories, a lucky spin, a sticker album, moving a save with a "save code", wrapping the web game as an APK, a cloud server so the laptop need not stay on.

## Difficulty

- 6-year-old: counting, short words, picture help, read-aloud.
- 8-year-old: sums and change, longer words, reading without pictures.
- Later phases can set this per player on the join screen.

## Not in scope (for now)

- 3D graphics. The style is simple, bright 2D drawn in code.
- Playing away from home. The game runs on the home Wi-Fi from the laptop.
- Chat with text. Players use emotes; the family is in the same room.
