# Game modules

Every game behind a building (Pet Home, Race Track, Monopoly ...) is a **module**: one server file and one
client file with the same id. Modules never edit the core files; they plug in through the two small APIs below.

| | Server | Client |
|---|---|---|
| File | `dev/games/<id>.js` | `dev/public/games/<id>.js` |
| Shape | `module.exports = function (api) { ... }` | `window.FTGames.<id> = { init, open, onMessage, ... }` |
| Loaded by | `server.js` (list `GAMES`) | `index.html` script tag, started by `game.js` |

The id is used for everything: the building in `WORLD.buildings`, the room name, the message prefix
(`<id>.something`), the saved data (`profile[<id>]`, `save[<id>]`) and `players[].ext[<id>]`.
Ids today: `pets`, `race`, `obby`, `boss`, `monopoly`, `escape`, `plot`.

A module that fails to load is logged and its building stays "coming soon"; the rest of the game is unaffected.

## How a session goes

1. The player walks to the building's door and taps **Enter ...**. `game.js` calls the client module's `open()`.
2. `open()` builds the module's full-screen overlay and calls `api.enter()`. The town stops drawing, its
   buttons hide, and the server is told the player is now in room `<id>`.
3. The server calls the module's `enter(p)` hook. Send that player everything needed to draw the room now.
4. Client and server exchange `<id>.*` messages.
5. A **Back to town** button (always visible, top corner) removes the overlay and calls `api.leave()`.
   The server calls `leave(p)`. `leave(p)` is also called when the player disconnects.
6. After a dropped connection the page rejoins by itself and re-enters the room, so `enter(p)` runs again
   for a **new** player object with a new `p.id`. Key anything that must survive on `p.key` (the lower-case
   name), never on `p.id`.

## Server API (`dev/games/<id>.js`)

```js
'use strict';
module.exports = function (api) {
  api.room({ enter: function (p) { ... }, leave: function (p) { ... } });
  api.on('feed', function (p, m) { ... });          // handles { t: '<id>.feed', ... } from a tablet
};
```

A player `p` has: `id` (changes on reconnect), `key` (lower-case name, stable), `name`, `color`, `hat`, `big`,
`stars` (earned in total), `outfit`, `car`, `room`, `x`, `y` (town position).

| Call | What it does |
|---|---|
| `api.id` | this module's id |
| `api.on(name, fn(p, m))` | handle message `<id>.<name>`. Errors inside are caught and logged |
| `api.room({ enter(p), leave(p) })` | registers the room `<id>` and its hooks |
| `api.send(p, obj)` | send to one player. Use `t: '<id>.<name>'` |
| `api.broadcast(obj, filter)` | send to everyone, or to those `filter(p)` accepts. `api.inRoom(api.id)` is a ready filter |
| `api.roomList(room)` | players in a room, in join order |
| `api.players` | `Map` id -> player (everyone online) |
| `api.toast(msg, filter)` | a short notice on the tablets |
| `api.addStars(p, n)` | the player earns `n` stars (level, family jar and their HUD update by themselves) |
| `api.coins(p)` | stars the player can spend right now |
| `api.spend(p, n)` | takes `n` stars; returns `false` and takes nothing if there are not enough |
| `api.levelOf(stars)` | level for a number of earned stars; `api.levelOf(p.stars)` |
| `api.prof(p)` | the player's saved profile. Keep the module's data in `api.prof(p)[api.id]` only |
| `api.save` | the whole save object. Shared module data goes in `api.save[api.id]` only |
| `api.saveSoon()` | write the save file soon. Call it after changing saved data |
| `api.ext(fn(p))` | what everyone may see of a player (shown in `players[].ext[<id>]` on every tablet): a small flat object, or `undefined` for nothing. After it changes, call `api.sendPlayers()` |
| `api.addQuest(def)` | adds a daily quest kind, see below |
| `api.questEvent(p, type, n)` | counts progress for a quest kind |
| `api.onJoin(fn(p))`, `api.onQuit(fn(p))` | someone joined the town / went offline |
| `api.rnd(a, b)`, `api.clamp(v, a, b)`, `api.shuffle(list)`, `api.today()`, `api.cleanName(s)` | helpers |
| `api.WORLD` | the town: size, spawn, buildings |

Rules on the server:

- **Never trust the tablet for anything that pays out.** Stars, purchases, wins and unlocks are decided on the
  server. Positions inside a mini-game may be trusted (home network), like town movement is.
- Validate every message field (`parseInt`, range checks, `Array.isArray`). A bad message must be ignored, not crash.
- Saved data: plain JSON, small. Only ever add fields; old saves must keep loading. A profile may not have the
  module's key yet: `const d = prof[api.id] || (prof[api.id] = { ... })`.
- Use your own `setInterval` / `setTimeout` for game timing. Stop timers when the room is empty.
- No new npm packages. CommonJS, Node 18+.

### Daily quests

```js
api.addQuest({ type: 'pets.feed', icon: '🍖', solo: true, tiers: [[3, 4], [5, 6]],   // [how many, reward stars]
  en: 'Feed your pet {n} times', zh: '喂宠物 {n} 次', py: 'wèi chǒngwù {n} cì', ms: 'Beri makan haiwan {n} kali' });
api.questEvent(p, 'pets.feed');        // when it happens
```

`type` starts with the module id. `solo: true` means one player alone can finish it. Give every module one or
two quests, at least one of them solo. Texts are in English, Chinese (Simplified) with pinyin, and Malay.

### Star economy

Stars are scarce on purpose. Earning: about 2 to 3 stars per minute of active play; a 3 to 5 minute round pays
roughly 8 to 15 stars to the best player and a little less to the others (nobody gets nothing for finishing).
One-off or once-a-day bonuses may go up to 20. Things to buy cost 10 to 150 stars, in line with `shop.js`.
Anything that could be farmed (instant restarts, trading back and forth) needs a cooldown or a daily cap.

## Client API (`dev/public/games/<id>.js`)

```js
(function () {
  'use strict';
  var api = null, root = null;
  window.FTGames = window.FTGames || {};
  window.FTGames.demo = {
    init: function (a) { api = a; },                 // once, at page load
    open: function () { /* build the overlay */ api.enter('demo'); },
    onMessage: function (m) { /* every 'demo.*' message */ },
    onPlayers: function () { /* optional: the players list changed */ },
    onMe: function () { /* optional: my stars / level changed */ },
    town: function (c, t, view, items) { /* optional: draw in the town, see below */ }
  };
})();
```

| Call | What it gives |
|---|---|
| `api.send(obj)` | send to the server. Use `t: '<id>.<name>'` |
| `api.enter(id)` / `api.leave()` | go into the module's room / back to the town |
| `api.room()` | where this tablet is: `'town'`, `'studio'`, or a module id |
| `api.myId()` | my player id (changes after a reconnect) |
| `api.me()` | my numbers: `{ stars, coins, lv, lvAt, lvNext, owned, quests }`, or `null` before they arrive |
| `api.self()` | my entry in `api.players()` |
| `api.players()` | object id -> `{ id, name, color, hat, big, lv, room, outfit, car, drive, ext, x, y }` (x, y are town positions) |
| `api.drawAvatar(c, p, x, y, t, o)` | draws player `p` as they look in town with their feet at (x, y). `o`: `{ scale, facing: 1 or -1, moving: bool, car: true to draw their car instead }`. Returns the height drawn |
| `api.nameTag(c, p, x, y, isMe)` | the name pill with the level, bottom edge at `y`, centred on `x`. Returns its height |
| `api.label(c, text, x, y, bg, fg, size)` | a small pill label |
| `api.rr(c, x, y, w, h, r)`, `api.starPath(c, x, y, r)` | path helpers (rounded rectangle, star) |
| `api.stick(el)` | a drag-anywhere joystick on element `el`; arrow keys and WASD count too. `.read()` gives `{ x, y }` in -1..1, `.draw(c)` paints it (context in CSS pixels, origin at the element's top-left), `.destroy()` removes it |
| `api.keys()` | keys held down now, lower case (`arrowleft`, `' '`, `w`) |
| `api.toast(msg)` | a short notice |
| `api.sfx(name)` | a sound: `tap open close star quest claim chest levelup buy deny right wrong tagit tagwin emote join goal car` |
| `api.three({ en, zh, py, ms })` | HTML for a name in three languages (pinyin already in `<span class="py">`) |
| `api.esc(s)`, `api.clamp(v, a, b)`, `api.FONT`, `api.NAVY` | helpers |
| `window.DressDesigner`, `window.CarDesigner` | `draw(ctx, x, y, design, opts)` and `defaults()`, for outfits and cars |
| `window.Scene.shade(hex, f)` | a colour made darker (`f` < 0) or lighter (`f` > 0) |

### The overlay

- One root element: `<div class="screen">` (fixed, covers the page, `z-index: 20`) appended to `document.body`,
  removed on close. Give it a background so the town does not show through.
- Put the module's CSS in a `<style id="<id>-style">` element added once, class names prefixed `<id>-`. Reuse
  the global classes from `style.css`: `.btn`, `.btn.primary`, `.pill`, `.round`, `.chip`, `.sw`, `.py`, `.hint`.
- A **Back to town** `.btn` in a top corner, at all times. It must clean up everything: animation frames,
  timers, listeners, the stick.
- Draw with a `<canvas>` sized for `devicePixelRatio` (cap it at 2) and redraw on `resize`.
- Buttons play a soft tap sound by themselves. Add the attribute `data-quiet` to a button that plays its own sound.

### Drawing in the town (optional)

`town(c, t, view, items)` is called every frame while the town is on screen. Push things to draw into `items`
as `{ y: <world y for depth sorting>, d: function () { ... draw with c ... } }`. `c` is already in world
coordinates; `view` is `{ x, y, w, h }`, the visible part of the world; `t` is seconds. Skip anything outside `view`.
Town positions of players are `api.players()[id].x / .y`; only players with `room === 'town'` are in the town.

## Rules for every module

- **Together.** Works with 1 player and gets better with 2 to 8. Wherever players move around, everyone in the
  room sees everybody else move, with their real avatar and name tag. A late joiner can come in mid-game or
  watch until the next round. A player who leaves or disconnects must not freeze the game for the others.
- **Ages 6 and 8, plus parents.** No reading needed to play: icons, numbers, colours. Forgiving: no permanent
  loss, quick retry. Where it fits, an easy and a harder setting.
- **No word or vocabulary learning.** No word cards, no spelling or translation questions. Names of things
  (pets, items, quests) are shown in English, Chinese with pinyin, and Malay, as labels only.
- **Maths stays inside play**: prices, counting, adding to a target, change. Show the sum when stars are spent
  (`42 − 15 = 27`). Never a quiz screen that blocks the game.
- **Touch first.** Every control at least 48 px. Landscape from 800x480 to 1280x800. Pointer events (not mouse
  or touch events). Keyboard is a bonus for the laptop.
- **Old tablets.** Client JS is ES2017 at most, written like the existing files: `var`, function expressions,
  no arrow functions, no optional chaining, no `??`, no object spread, no `async`/`await`. No external assets:
  everything is drawn in code. Keep per-frame work light; cache static drawings in an offscreen canvas.
- **Look.** 2.5D cartoon like the town (`scene.js`): light from the top left, a darker side face on things
  that stand up, soft shadows to the lower right, navy `#1B2A49` outlines 3 to 4 px, bright flat-ish colours
  with a little gradient. Panels are cream `#FFF3D6`, primary buttons yellow `#FFD66B`, pill shaped. Fredoka font.
- **Sound.** Call `api.sfx()` at the moments that matter (a win, a pickup, a purchase, a mistake).

## Testing a module

Never use ports 3000 or 3001, `data/live`, `data/dev` or `releases/`. Start a private server:

```bash
PORT=31xx TEST_SHUTDOWN=1 DATA_DIR=<scratch folder> node dev/server.js     # run it in the background
curl -s http://localhost:31xx/api/status                                   # is it up?
curl -s http://localhost:31xx/api/shutdown                                 # stops it (only works with TEST_SHUTDOWN=1)
```

- Protocol tests: a Node script with the `ws` package from `node_modules/ws`, joining as one or more players:
  `ws.send(JSON.stringify({ t: 'join', name: 'Ann', color: '#FF7A45', hat: 0, big: false }))`, then
  `{ t: 'room', room: '<id>' }`, then the module's messages. To give a test player stars, write a `save.json`
  into the scratch data folder before starting (`{ "profiles": { "ann": { "name": "Ann", "stars": 500 } }, "family": 500, "gallery": [] }`).
- `node --check <file>` on both files.
- In a browser, a second player can be a `new WebSocket('ws://' + location.host)` opened from the page.
- When the page is not on screen the browser pauses `requestAnimationFrame`. For a test only, run this in the
  page first: `window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(performance.now()); }, 16); }; window.cancelAnimationFrame = clearTimeout;`
- Always stop the test server at the end and confirm with `curl` that it no longer answers.
