// Minimal CDP client + deterministic frame capture in chrome-headless-shell (BeginFrame + virtual time).
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const SHELL = (() => {
  const base = path.join(os.homedir(), 'AppData/Local/ms-playwright');
  const d = fs.readdirSync(base).filter((n) => n.startsWith('chromium_headless_shell')).sort().pop();
  const sub = fs.readdirSync(path.join(base, d))[0];
  const p = path.join(base, d, sub, 'chrome-headless-shell.exe');
  return fs.existsSync(p) ? p : path.join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
})();

export async function launch({ width, height, userDataDir }) {
  const args = [
    '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`,
    '--deterministic-mode', '--enable-begin-frame-control', '--run-all-compositor-stages-before-draw',
    '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-checker-imaging',
    '--disable-new-content-rendering-timeout', '--disable-image-animation-resync',
    '--hide-scrollbars', '--font-render-hinting=none', '--force-color-profile=srgb', '--disable-gpu-vsync',
    `--window-size=${width},${height}`, 'about:blank',
  ];
  const proc = spawn(SHELL, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
    proc.on('exit', (c) => rej(new Error('browser exited ' + c + buf)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pend = new Map(); const handlers = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method) handlers.forEach((h) => h(m));
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const on = (h) => handlers.push(h);
  return { proc, send, on, close: () => { try { ws.close(); } catch {} proc.kill(); } };
}

export async function openPage(b, { url, width, height, dsf = 1, onBinding }) {
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true, width, height });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  const waiters = [];
  b.on((m) => { if (m.sessionId !== sessionId) return; for (const w of [...waiters]) if (w.method === m.method) { waiters.splice(waiters.indexOf(w), 1); w.res(m.params); } if (m.method === 'Runtime.consoleAPICalled') console.log('[page]', m.params.args.map((a) => a.value ?? a.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') console.log('[page error]', JSON.stringify(m.params.exceptionDetails).slice(0, 600)); });
  const wait = (method) => new Promise((res) => waiters.push({ method, res }));
  await s('Page.enable'); await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dsf, mobile: false });
  if (onBinding) { await s('Runtime.addBinding', { name: '__input' }); b.on((m) => { if (m.sessionId === sessionId && m.method === 'Runtime.bindingCalled') onBinding(JSON.parse(m.params.payload)); }); }
  let ticks = Math.round(os.uptime() * 1000) + 5000; const interval = 1000 / 60;
  // Virtual time only moves in whole milliseconds: frame n ends at round(n * 1000 / fps), so the
  // steps go 17, 17, 16 and never drift. Frame times for CSS animations use the same clock.
  let n = 0;
  const next = () => Math.round((n + 1) * interval) - Math.round(n * interval);
  const frame = async (shot) => {
    ticks += next(); n++;
    const r = await s('HeadlessExperimental.beginFrame', { frameTimeTicks: ticks, interval, noDisplayUpdates: false, ...(shot ? { screenshot: typeof shot === 'object' ? shot : { format: 'png' } } : {}) });
    return r.screenshotData ? Buffer.from(r.screenshotData, 'base64') : null;
  };
  // virtual time: paused; each frame advances it by one interval
  await s('Emulation.setVirtualTimePolicy', { policy: 'pause' });
  const advance = async (ms) => {
    const p = wait('Emulation.virtualTimeBudgetExpired');
    await s('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: ms });
    await p;
  };
  // load: let network go, pump frames until load event
  const loaded = wait('Page.loadEventFired');
  await s('Emulation.setVirtualTimePolicy', { policy: 'pauseIfNetworkFetchesPending', budget: 5000 });
  s('Page.navigate', { url });
  let done = false; loaded.then(() => (done = true));
  for (let i = 0; i < 2000 && !done; i++) { await frame(false); await new Promise((r) => setTimeout(r, 5)); }
  const evaluate = async (expr) => (await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const tick = async (shot) => { await advance(next()); return frame(shot); };
  return { s, frame, advance, evaluate, interval, tick };
}
