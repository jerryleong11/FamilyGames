# Family Town

Laptop-hosted multiplayer web game for one family: two kids (girl 8, boy 6) on Honor kids tablets, plus parents. Everyone plays together in one shared town and sees each other live. Learning (English, 中文, Bahasa Malaysia, maths) happens inside the gameplay, never as a language switch or a quiz wall.

Read `docs/HANDOFF.md` first: it is the compiled history of the planning conversation, with every decision, the current state, what is untested, and the backlog. `docs/GAME-PLAN.md` and `docs/ARCHITECTURE.md` have the design and the technical detail.

## Layout

```
dev/                working copy: server.js, words.js, shop.js, public/   <- edit here only
releases/vN/        frozen copies made by the release tool        <- never edit
live.json           which release the kids' server runs
data/live/          kids' saves + gallery (never touched by releases)
data/dev/           test saves for the dev server
tools/run.js        starts live (port 3000) or dev (port 3001)
tools/release.js    release / --rollback / --status
node_modules/ws     shared by dev and all releases
```

## Commands

- `node tools/run.js dev` (or `start-dev.bat`): dev server on http://localhost:3001
- `node tools/run.js live` (or `start-live.bat`): kids' server on port 3000
- `node tools/release.js`: freeze `dev/` as the next `releases/vN` and mark it live
- `node tools/release.js --rollback` / `--status`

## Rules

- Never edit `releases/` or `data/live/`. Change `dev/`, test on 3001, then release.
- Do not restart the live server while someone is playing. `--status` shows who is online. The running live server keeps its old version until restarted; tablets auto-reload after the restart.
- No build step, no frameworks. Server: Node.js + `ws`, CommonJS. Client: plain HTML5 Canvas + vanilla JS in `dev/public/`.
- Client JS must run on an older Android tablet browser: ES2017 at most (no optional chaining, no `??`), pointer events, no external assets, everything drawn in code.
- Touch first: every control at least 48px, usable in landscape from 800x480 up to 1280x800.
- Visual style: Fredoka font, navy `#1B2A49` outlines 3-4px, cream `#FFF3D6` panels, yellow `#FFD66B` primary buttons, pill buttons. Reuse classes in `dev/public/style.css`. Panels and buttons are flat; the town is 2.5D.
- Town scenery lives in `dev/public/scene.js` (`window.Scene`): light from the top left, a darker side face on anything that stands up (`DX`/`DY` give the depth direction), a soft shadow on the ground to the right. Static things are drawn once into cached sprites (`sprite()`); only moving things are drawn every frame.
- Sound goes through `window.Sfx` in `dev/public/sound.js` (`Sfx.play('star')`), all synthesised, no audio files. Guard calls with `if (window.Sfx)`.
- Growth data (level thresholds, shop items with prices, the daily quest pool) lives in `dev/shop.js`; the server owns stars, levels, purchases and quest progress. New saves fields are only ever added, never renamed.
- Pinyin is always wrapped in `<span class="py">` (device font): Fredoka misdraws `ī`.
- Every game must be playable together (kids and parents). Anything on a map shows where the other players are.
- Words shown to the kids come from `dev/words.js` and always appear in all three languages (English, 中文 with pinyin, Malay). Chinese is Simplified.
- Each new game is its own file exposing one global (like `design-dress.js` / `design-car.js`), opened from a building in the town; add the building to `WORLD.buildings` in `dev/server.js` and its action in `findAction()` / `actBtn` handler in `dev/public/game.js`.
- Player designs sent to the server must be flat objects of small integers and `#rrggbb` strings (see `cleanDesign` in `server.js`).
