// Release control for Family Town.
//   node tools/release.js             -> freeze dev/ as the next version (v1, v2, ...) and make it live
//   node tools/release.js --rollback  -> switch live back to the previous version
//   node tools/release.js --status    -> show the live version, all releases and the live server
// A running live server is never changed: the kids keep playing the version it started with
// until its window is closed and start-live is run again.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const spawnSync = require('child_process').spawnSync;

const ROOT = path.join(__dirname, '..');
const DEV = path.join(ROOT, 'dev');
const REL = path.join(ROOT, 'releases');
const LIVE_FILE = path.join(ROOT, 'live.json');
const LIVE_PORT = 3000;
const arg = process.argv[2] || '';

function out(s) { console.log(s === undefined ? '' : '  ' + s); }
function fail(msg) { console.error('\n  ' + msg.split('\n').join('\n  ') + '\n'); process.exit(1); }
function readLive() { try { return JSON.parse(fs.readFileSync(LIVE_FILE, 'utf8')); } catch (e) { return null; } }
function writeLive(obj) { fs.writeFileSync(LIVE_FILE, JSON.stringify(obj, null, 2) + '\n'); }
function listReleases() {
  let names = [];
  try { names = fs.readdirSync(REL); } catch (e) {}
  return names
    .filter(function (n) { return /^v\d+$/.test(n) && fs.existsSync(path.join(REL, n, 'server.js')); })
    .sort(function (a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
}
function highestNumber() {
  let names = [];
  try { names = fs.readdirSync(REL); } catch (e) {}
  return names.reduce(function (m, n) { return /^v\d+$/.test(n) ? Math.max(m, parseInt(n.slice(1), 10)) : m; }, 0);
}
function releasedAt(v) {
  try { return JSON.parse(fs.readFileSync(path.join(REL, v, 'version.json'), 'utf8')).released || ''; } catch (e) { return ''; }
}
function liveStatus(cb) {
  let done = false;
  function finish(v) { if (!done) { done = true; cb(v); } }
  const req = http.get({ host: '127.0.0.1', port: LIVE_PORT, path: '/api/status', timeout: 2000 }, function (res) {
    let body = '';
    res.on('data', function (c) { body += c; });
    res.on('end', function () { try { finish(JSON.parse(body)); } catch (e) { finish(null); } });
  });
  req.on('timeout', function () { req.destroy(); finish(null); });
  req.on('error', function () { finish(null); });
}
function describeServer(st, wanted) {
  if (!st) {
    out('Live server: not running.');
    if (wanted) out('Version ' + wanted + ' starts the next time you run start-live.');
    return;
  }
  const names = (st.names || []).join(', ');
  out('Live server: running version ' + st.version + ' with ' + st.players + ' player' + (st.players === 1 ? '' : 's') + ' online' + (names ? ' (' + names + ')' : '') + '.');
  if (wanted && st.version !== wanted) {
    out('');
    out('The kids keep playing the OLD version (' + st.version + ') for now. Nothing changes mid-game.');
    out('To switch to ' + wanted + ': wait until they finish, close the start-live window,');
    out('then run start-live again. The tablets reload by themselves.');
  } else if (wanted) {
    out('It is already on ' + wanted + '.');
  }
}

if (arg === '--status') {
  const live = readLive();
  const rels = listReleases();
  out();
  out('Live version: ' + (live && live.version ? live.version : 'none yet') + (live && live.previous ? '   (previous: ' + live.previous + ')' : ''));
  out('Releases:     ' + (rels.length ? '' : 'none yet'));
  rels.forEach(function (v) { out('  ' + v + (live && live.version === v ? '  <- live' : '') + (releasedAt(v) ? '   ' + releasedAt(v) : '')); });
  liveStatus(function (st) { describeServer(st, live && live.version); out(); });
} else if (arg === '--rollback') {
  const live = readLive();
  if (!live || !live.version) fail('Nothing is live yet, so there is nothing to roll back.');
  if (!live.previous) fail('There is no previous version to go back to (live is ' + live.version + ').');
  if (!fs.existsSync(path.join(REL, live.previous, 'server.js'))) fail('The previous version ' + live.previous + ' is missing from releases/.');
  writeLive({ version: live.previous, previous: live.version });
  out();
  out('Rolled back: live is now ' + live.previous + ' (was ' + live.version + ').');
  out('Run --rollback again to go forward to ' + live.version + '.');
  liveStatus(function (st) { describeServer(st, live.previous); out(); });
} else if (arg === '' || arg === '--release') {
  if (!fs.existsSync(path.join(DEV, 'server.js'))) fail('Cannot find dev/server.js - nothing to release.');
  if (typeof fs.cpSync !== 'function') fail('This needs Node.js 16.7 or newer. Install the current LTS from nodejs.org.');
  const version = 'v' + (highestNumber() + 1);
  const dest = path.join(REL, version);
  fs.mkdirSync(REL, { recursive: true });
  fs.cpSync(DEV, dest, {
    recursive: true,
    filter: function (src) {
      const rel = path.relative(DEV, src);
      if (!rel) return true;
      const top = rel.split(path.sep);
      return top.indexOf('node_modules') === -1 && top[0] !== 'data';
    }
  });
  fs.writeFileSync(path.join(dest, 'version.json'), JSON.stringify({ version: version, released: new Date().toISOString() }, null, 2) + '\n');

  // Refuse to go live with a server that cannot even start.
  const bad = [];
  ['server.js', 'words.js'].forEach(function (f) {
    const file = path.join(dest, f);
    if (!fs.existsSync(file)) return;
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) bad.push(f + ':\n' + String(r.stderr || r.error || '').trim());
  });
  if (bad.length) {
    fail('Release ' + version + ' was NOT made live: the code has an error.\n\n' + bad.join('\n\n') +
      '\n\nThe copy is kept in releases/' + version + ' for inspection. Live is unchanged. Fix dev/ and release again.');
  }

  const old = readLive();
  const live = { version: version };
  if (old && old.version) live.previous = old.version;
  writeLive(live);
  out();
  out('Released ' + version + (live.previous ? ' (previous: ' + live.previous + ')' : '') + '.');
  out('Frozen copy: ' + dest);
  liveStatus(function (st) { describeServer(st, version); out(); });
} else {
  fail('Use: node tools/release.js   |   --rollback   |   --status');
}
