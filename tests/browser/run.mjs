#!/usr/bin/env node
// Runs the browser suites against the web app and/or the Expo app's web build.
//
//   node tests/browser/run.mjs              every suite (web, then app)
//   node tests/browser/run.mjs web          the web app suites
//   node tests/browser/run.mjs app          the app suites (builds the web export first)
//   node tests/browser/run.mjs web-fixes app-logging   single suites (file names without .mjs)
//   --no-build    app: reuse app/dist instead of running `expo export` again
//   --serve       only start the servers and keep them running (web; add `app` for the
//                 app too), e.g. for screenshot scripts; Ctrl-C stops them
//
// It serves setlog/ at $WEB (default :8765) and app/dist at $APP (default :8790), unless
// something already answers there, downloads the sample Strong export and builds a
// fresh backup for the app suites.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HERE, ROOT, WEB, APP, STRONG } from './env.mjs';

export const WEB_SUITES = ['web-template-update', 'web-start-screen', 'web-v13', 'web-de', 'web-themes', 'web-suggest', 'web-fixes', 'web-smoke'];
export const APP_SUITES = ['app-first-start', 'app-logging', 'app-editing', 'app-parity'];
const STRONG_URL = 'https://raw.githubusercontent.com/AlexandrosKyriakakis/StrongAppAnalytics/main/Data/strong.csv';

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const serveOnly = args.includes('--serve');
const picks = args.filter((a) => !a.startsWith('--'));
if (serveOnly && !picks.length) picks.push('web');
let suites = [];
for (const p of picks.length ? picks : ['all']) {
  if (p === 'all') suites.push(...WEB_SUITES, ...APP_SUITES);
  else if (p === 'web') suites.push(...WEB_SUITES);
  else if (p === 'app') suites.push(...APP_SUITES);
  else {
    const name = path.basename(p).replace(/\.mjs$/, '');
    if (!fs.existsSync(path.join(HERE, `${name}.mjs`))) { console.error(`No suite ${name}.mjs in tests/browser`); process.exit(2); }
    suites.push(name);
  }
}
suites = [...new Set(suites)];
const needsApp = suites.some((s) => s.startsWith('app-'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const get = (url) => new Promise((resolve) => {
  http.get(url, (res) => { let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body })); })
    .on('error', () => resolve(null));
});

// A static file server. `resolve(pathname)` maps a URL path to a file (or null for a 404).
async function serve(port, resolve, notFound = null) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = resolve(pathname);
    let status = 200;
    if (!file && notFound) { file = notFound; status = 404; }
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(status, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(Number(port), ok); });
  return server;
}
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

async function serveWeb() {
  const url = new URL(WEB);
  const running = await get(new URL('sw.js', url).href);
  if (running && running.status === 200 && running.body.includes('setlog-v')) {
    console.log(`web app: already served at ${WEB}`);
    return null;
  }
  const dir = path.join(ROOT, 'setlog');
  const server = await serve(url.port || 80, (p) => {
    const file = path.join(dir, p);
    if (!file.startsWith(dir)) return null;
    if (isFile(file)) return file;
    return isFile(path.join(file, 'index.html')) ? path.join(file, 'index.html') : null;
  });
  console.log(`web app: serving setlog/ at ${WEB}`);
  return server;
}

// Expo Router's static web export: /measure → measure.html, /workout/abc → workout/[id].html.
// (`npx expo serve` redirects /measure to /measure/ once measure/[type] exists, and then 404s.)
function expoRoute(dist, pathname) {
  const exact = path.join(dist, pathname);
  if (!exact.startsWith(dist)) return null;
  if (isFile(exact)) return exact;
  const segs = pathname.split('/').filter(Boolean);
  if (!segs.length) return path.join(dist, 'index.html');
  const match = (dir, rest) => {
    const [seg, ...more] = rest;
    if (!more.length) {
      if (isFile(path.join(dir, `${seg}.html`))) return path.join(dir, `${seg}.html`);
      if (isFile(path.join(dir, seg, 'index.html'))) return path.join(dir, seg, 'index.html');
    } else if (fs.existsSync(path.join(dir, seg))) {
      const hit = match(path.join(dir, seg), more);
      if (hit) return hit;
    }
    for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (!/^\[.+\]/.test(entry)) continue; // a dynamic segment: [id].html or [id]/
      if (!more.length && entry.endsWith('.html')) return path.join(dir, entry);
      if (more.length && fs.statSync(path.join(dir, entry)).isDirectory()) {
        const hit = match(path.join(dir, entry), more);
        if (hit) return hit;
      }
    }
    return null;
  };
  return match(dist, segs);
}

function sh(cmd, argv, cwd) {
  console.log(`$ (${path.relative(ROOT, cwd) || '.'}) ${cmd} ${argv.join(' ')}`);
  const r = spawnSync(cmd, argv, { cwd, stdio: 'inherit', env: { ...process.env, CI: '1' } });
  if (r.status !== 0) { console.error(`failed: ${cmd} ${argv.join(' ')}`); process.exit(1); }
}

async function serveApp() {
  const appDir = path.join(ROOT, 'app');
  const dist = path.join(appDir, 'dist');
  if (!fs.existsSync(path.join(appDir, 'node_modules'))) sh('npm', ['ci'], appDir);
  // `npm run bundle` writes the iOS/Android export into the same dist/, so build web unless told not to
  if (!noBuild || !isFile(path.join(dist, 'index.html'))) {
    sh('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist'], appDir);
  }
  const port = new URL(APP).port || '8790';
  const already = await get(APP);
  if (already && already.status === 200) { console.log(`app: already served at ${APP}`); return null; }
  const server = await serve(port, (p) => expoRoute(dist, p.replace(/\/+$/, '') || '/'), path.join(dist, '+not-found.html'));
  console.log(`app: serving app/dist at ${APP}`);
  return server;
}

async function ensureStrong() {
  if (fs.existsSync(STRONG)) return;
  console.log('data: downloading the sample Strong export (86 workouts)');
  const res = await fetch(STRONG_URL);
  if (!res.ok) throw new Error(`could not download ${STRONG_URL}: ${res.status}`);
  fs.writeFileSync(STRONG, await res.text());
}

function runSuite(name) {
  return new Promise((resolve) => {
    console.log(`\n=== ${name} ===`);
    const child = spawn(process.execPath, [path.join(HERE, `${name}.mjs`)], { cwd: ROOT, env: { ...process.env, WEB, APP } });
    let out = '';
    child.stdout.on('data', (c) => { out += c; process.stdout.write(c); });
    child.stderr.on('data', (c) => { out += c; process.stderr.write(c); });
    child.on('close', (code) => {
      const m = out.match(/(\d+) checks passed/);
      resolve({ name, ok: code === 0, checks: m ? Number(m[1]) : (out.match(/^PASS /gm) || []).length });
    });
  });
}

const web = await serveWeb();
if (serveOnly) {
  if (needsApp) await serveApp();
  console.log('Serving until Ctrl-C.');
  await new Promise(() => {});
}
let app = null;
const results = [];
try {
  if (needsApp) {
    await ensureStrong();
    // a fresh backup every run: the app suites rely on recent dates (backup reminder, body weight)
    results.push(await runSuite('make-backup'));
    if (!results[0].ok) throw new Error('make-backup failed');
    results.length = 0;
    app = await serveApp();
  }
  for (const s of suites) results.push(await runSuite(s));
} finally {
  app?.close();
  web?.close();
}

console.log('\n--- summary ---');
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.checks ? ` (${r.checks} checks)` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} suites failed` : `\nall ${results.length} suites passed`);
process.exit(failed ? 1 : 0);
