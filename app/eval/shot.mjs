// Screenshots each answer of an eval run at its first, middle and last step, side by side with its
// steps' text, task and board, into <runDir>/shots/q<i>.png. Kit and html scenes only (plot and
// bubble-sort are React components and show as a placeholder). Usage: node eval/shot.mjs <runDir>
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const run = process.argv[2];
const app = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const rt = fs.readFileSync(path.join(app, 'src/kit/runtime.js'), 'utf8');
const iconsSrc = fs.readFileSync(path.join(app, 'src/kit/icons.ts'), 'utf8');
const icons = iconsSrc.slice(iconsSrc.indexOf('{', iconsSrc.indexOf('ICONS')), iconsSrc.lastIndexOf('};') + 1);
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const vars = '--fg:#1f3038;--fg-2:#4a5c64;--fg-3:#66767e;--fg-4:#9aa8ae;--line:#dde5e9;--line-2:#c9d4d9;--sub:#e9eff2;--bg:#f0f4f6;--raise:#ffffff;--hover:#e3eaee;--acc:#c4521b;--acc-soft:#f8e6dc;--acc-ink:#9c3f12;--acc-fg:#fff;--done:#1f3038;--sans:system-ui';
const js = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
fs.mkdirSync(path.join(run, 'shots'), { recursive: true });

const frame = (w, steps, k) => {
  const isolate = (h) => h.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (all, a = '', c) => (/\bsrc\s*=|type\s*=\s*["']?module/i.test(a) ? all : `<script${a}>{\n${c}\n}</script>`));
  const body = w.kind === 'html' ? isolate(w.html) : `<script>U.mount(${js(w.kind)}, ${js(w[w.kind])}, ${js(steps.map((s) => ({ reveal: s.reveal, focus: s.focus })))})</script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{${vars}} html,body{margin:0;height:100%;overflow:hidden;background:transparent;color:var(--fg);font-family:var(--sans);font-size:14px}</style><script>window.__UNFOLD_ICONS=${icons}</script><script>${rt}</script></head><body>${body}<script>setTimeout(()=>postMessage({type:'step',index:${k},animate:false},'*'),60)</script></body></html>`;
};

for (const f of fs.readdirSync(run).filter((f) => /^q\d+\.json$/.test(f))) {
  const r = JSON.parse(fs.readFileSync(path.join(run, f), 'utf8'));
  const L = r.lesson;
  if (!L) { console.log(f, 'no lesson'); continue; }
  // each shown step plays on its scene (a chapter saved before scenes: the one widget), numbered within it
  const starts = L.widget && !L.steps[0]?.scene ? [0] : L.steps.flatMap((st, k) => (st.scene ? [k] : []));
  const sceneAt = (k) => {
    const s = starts.filter((x) => x <= k).pop() ?? 0;
    const end = starts.find((x) => x > s) ?? L.steps.length;
    return { w: L.steps[s].scene ?? L.widget, from: s, steps: L.steps.slice(s, end) };
  };
  const carried = (k, key) => { for (let j = k; j >= 0; j--) { if (L.steps[j][key] !== undefined) return L.steps[j][key]; if (j === sceneAt(k).from) break; } return undefined; };
  const n = L.steps.length, ks = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const dir = path.join(run, 'shots', f.replace('.json', ''));
  fs.mkdirSync(dir, { recursive: true });
  const kinds = starts.map((s) => (L.steps[s].scene ?? L.widget).kind).join('+');
  const cells = ks.map((k) => {
    const sc = sceneAt(k);
    const drawable = sc.w && (sc.w.kind === 'html' || sc.w[sc.w.kind]) && sc.w.kind !== 'plot' && sc.w.kind !== 'bubble-sort';
    if (drawable) fs.writeFileSync(path.join(dir, `s${k}.html`), frame(sc.w, sc.steps, k - sc.from));
    const board = carried(k, 'board');
    const lines = [...(board?.lines ?? []), ...(board?.values ?? []).map((v) => `${v.label}：${v.value}`)];
    const bd = lines.length ? `<div class="bd">${lines.map((l) => esc(l).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")).join("<br>")}</div>` : '';
    const task = carried(k, 'task') ?? L.task ?? '';
    const pic = drawable ? `<iframe src="s${k}.html"></iframe>` : `<div class="na">${esc(sc.w?.kind ?? '?')}（不在這裡畫）</div>`;
    return `<div class="c"><div class="t">${esc(task)}</div>${bd}${pic}<p><b>${k + 1}.</b> ${esc(L.steps[k].text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p></div>`;
  }).join('');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f0f4f6;font:14px system-ui;color:#1f3038;padding:14px}h1{font-size:16px;margin:0 0 4px}.m{color:#66767e;margin-bottom:10px}.g{display:flex;gap:10px}.c{width:640px;background:#f0f4f6;box-shadow:0 0 0 1px #dde5e9;border-radius:10px;overflow:hidden}iframe,.na{width:640px;height:420px;border:0;display:block}.na{display:grid;place-items:center;color:#9aa8ae}.t{padding:8px 12px;color:#4a5c64;font-size:13px}.bd{margin:0 12px;padding:8px 12px;background:#fff;border-radius:8px;box-shadow:0 0 0 1px #dde5e9;line-height:1.6}p{margin:0;padding:10px 12px;line-height:1.6;border-top:1px solid #dde5e9}</style></head><body><h1>q${r.i} ${esc(r.question)} — ${esc(L.title)}</h1><div class="m">${kinds} · ${n} 步 · $${r.cost?.usd?.toFixed(3)} · ${(r.ms / 1000).toFixed(0)}s${r.repaired ? ' · repaired' : ''}</div><div class="g">${cells}</div></body></html>`);
  const png = path.join(run, 'shots', f.replace('.json', '.png'));
  execFileSync(edge, ['--headless=new', '--hide-scrollbars', '--virtual-time-budget=5000', `--screenshot=${png}`, `--window-size=${ks.length * 650 + 28},760`, 'file:///' + path.join(dir, 'index.html').replace(/\\/g, '/')], { stdio: 'ignore' });
  console.log(f, 'shot', kinds);
}
