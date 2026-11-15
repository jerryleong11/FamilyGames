// Starts a Family Town server.
//   node tools/run.js live   -> the released version the kids play   (port 3000, data/live)
//   node tools/run.js dev    -> the working copy in dev/ for testing (port 3001, data/dev)
'use strict';
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;

const ROOT = path.join(__dirname, '..');
const mode = (process.argv[2] || 'live').toLowerCase();

function fail(msg) { console.error('\n  ' + msg.split('\n').join('\n  ') + '\n'); process.exit(1); }

let dir, port, dataDir, label;
if (mode === 'dev') {
  dir = path.join(ROOT, 'dev');
  port = '3001';
  dataDir = path.join(ROOT, 'data', 'dev');
  label = 'dev (test copy)';
} else if (mode === 'live') {
  let live;
  try { live = JSON.parse(fs.readFileSync(path.join(ROOT, 'live.json'), 'utf8')); } catch (e) { live = null; }
  if (!live || !live.version) {
    fail('There is no released version yet.\nRun "release" first (release.bat, or: node tools/release.js), then start-live again.');
  }
  dir = path.join(ROOT, 'releases', live.version);
  port = '3000';
  dataDir = path.join(ROOT, 'data', 'live');
  label = 'live ' + live.version;
  if (!fs.existsSync(path.join(dir, 'server.js'))) {
    fail('live.json points to ' + live.version + ', but releases/' + live.version + '/server.js is missing.\nRun "release" again, or "node tools/release.js --rollback".');
  }
} else {
  fail('Use: node tools/run.js live   or   node tools/run.js dev');
}

if (!fs.existsSync(path.join(dir, 'server.js'))) fail('Cannot find ' + path.join(dir, 'server.js'));
if (!fs.existsSync(path.join(ROOT, 'node_modules', 'ws'))) {
  fail('The "ws" package is missing.\nOpen a terminal in ' + ROOT + ' and run: npm install');
}
fs.mkdirSync(dataDir, { recursive: true });

console.log('Starting Family Town: ' + label);
const env = Object.assign({}, process.env, { PORT: process.env.PORT || port, DATA_DIR: dataDir });
const child = spawn(process.execPath, [path.join(dir, 'server.js')], { stdio: 'inherit', env: env, cwd: dir });
child.on('error', function (e) { fail('Could not start the server: ' + e.message); });
child.on('exit', function (code, signal) { process.exit(signal ? 1 : (code || 0)); });
['SIGINT', 'SIGTERM'].forEach(function (s) { process.on(s, function () { try { child.kill(s); } catch (e) {} }); });
