# Family Town

A family game that runs on this laptop. The kids' tablets (and mum's and dad's phones) join over the home Wi-Fi and everyone sees each other in the same town.

## One-time setup

1. **Install Node.js LTS** from https://nodejs.org (default options).
2. **Allow Node through the firewall.** The first time you start the game, Windows asks "Allow Node.js to communicate on these networks?" Tick **Private networks** and allow it.
3. **Give the laptop a fixed IP.** In your router, add a DHCP reservation for this laptop, so the address the tablets use never changes.
4. **The first release (`v1`) is already made**, so `start-live` works straight away.

The `ws` package is already included in `node_modules`. If that folder is ever missing, open a terminal here and run `npm install`.

## Playing (every day)

1. Double-click **`start-live.bat`** (Mac: `start-live.command`). Keep the window open.
2. The window prints the address, for example `http://192.168.1.20:3000`.
3. On each tablet, open that address in the browser. The laptop must be on, awake, and on the same Wi-Fi.
4. Close the window to stop the game. Progress is saved on the laptop.

## Changing the game safely

The kids never play the working copy, so editing cannot break a game in progress.

| Folder | What it is | Address |
|---|---|---|
| `dev/` | Working copy. Edit here. | `start-dev` -> http://localhost:3001 |
| `releases/v1, v2, ...` | Frozen copies. Never edit. | - |
| live | The release named in `live.json`. | `start-live` -> port 3000 |

1. Edit files in `dev/`.
2. Double-click **`start-dev.bat`** and test on http://localhost:3001. It uses its own test saves (`data/dev`).
3. Happy? Double-click **`release.bat`**. It copies `dev/` to the next `releases/vN`, checks the code starts, and marks it live.
4. **The running game does not change.** The release tool tells you who is online. When they finish, close the `start-live` window and start it again. The tablets reload onto the new version by themselves.

### Rollback

New version has a problem? Run `node tools/release.js --rollback` (or `npm run rollback`), then restart `start-live`. Run it again to go forward.

### Check what is live

`node tools/release.js --status` shows the live version, all releases, and who is online.

## Saves and backup

- Kids' progress, stars and gallery pictures: **`data/live/`** (`save.json` and `gallery/`).
- Releases and rollbacks never touch this folder.
- To back up, copy the `data/live` folder somewhere safe. To restore, copy it back while the game is stopped.

## Editing the word list

Words for the star cards and the guessing game are in **`dev/words.js`**, one line each:

```js
['🐱', 'cat', '猫', 'māo', 'kucing'],
```

Add or change lines, test with `start-dev`, then release.

## Troubleshooting

**Tablet cannot connect**
- Is the `start-live` window still open, and the laptop awake?
- Are the tablet and laptop on the same Wi-Fi (not guest Wi-Fi, not mobile data)?
- Use the address printed in the window, starting with `http://` (not `https://`).
- Windows Firewall: Settings > "Allow an app through firewall" > Node.js > tick **Private**. Check the Wi-Fi is set to a Private network.
- Did the laptop's IP change? Use the new address from the window, and reserve the IP in the router.

**"Someone is already playing as ..."**
- That name is still connected on another device or tab. Close it there, wait about 15 seconds, and try again.

**Kids' tablet browser is blocked**
- In the tablet's parental controls or kids mode, allow the browser and add the laptop address to the allowed sites.

**`start-live` says there is no released version**
- Run `release.bat` once first.

More detail: `docs/GAME-PLAN.md` (what the game is) and `docs/ARCHITECTURE.md` (how it works).
