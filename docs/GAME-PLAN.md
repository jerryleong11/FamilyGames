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
| **Race Track** | Side-view lane racing with the cars from the Car Garage; robots fill the grid; three tracks; best times. |
| **Obby Tower** | A jumping obstacle tower in an Easy and a Hard version, with checkpoints and best times. |
| **Monster Cave** | Co-op boss fight: carry number orbs to the cannon so they add up to the number on the boss's shield. Three bosses, three difficulties. |
| **Monopoly (大富翁)** | A 24-space town board, robots, paying rent with notes and getting change, 10 rounds. |
| **Escape Room** | Four rooms per run from ten puzzle kinds; each tablet holds different clues, so the family has to talk. |
| **Home Street** | Your own house and garden: buy and place items, visit each other, give hearts. |

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
