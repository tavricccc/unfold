// Unfold — a one-minute product film. The app in it is the real app (app.html), driven with real
// mouse and keyboard input; everything around it is drawn here, frame by frame, on a timeline.
import '@app/fonts/fonts.css';
import './film.css';
import { anim, at, cue, cues, ease as E, h, input, kf, now, onFrame, run, type Key } from './engine';

const film = document.getElementById('film')!;
const AW = 1200, AH = 750;               // the app window, in its own pixels
const enc = encodeURIComponent;

// ---------- lessons ----------
const Q = {
  moon: '為什麼月亮會有圓缺？',
  dna: 'DNA 是怎麼複製的？', doppler: '都卜勒效應是什麼？', cold: '冷戰是怎麼開始的？',
  vertex: '二次函數的頂點式為什麼能直接看出頂點？', chushi: '〈出師表〉裡諸葛亮想對劉禪說什麼？', acid: '酸鹼中和時發生了什麼事？',
  industry: '台灣的產業結構這幾十年怎麼變的？', water: '水循環是怎麼運作的？', induction: '電磁感應是怎麼產生電流的？',
  west: '為什麼台灣西部的人口比東部多？', english: '英文的假設語氣怎麼用？', impression: '印象派的畫為什麼看起來朦朧？',
  refraction: '光的折射是什麼？', gas: '介紹氣體三大定律', supply: '供給和需求怎麼決定價格？',
};
const SIDE = [Q.dna, Q.doppler, Q.induction, Q.chushi, Q.cold, Q.supply, Q.industry, Q.water];
const FOLLOW = '為什麼我們永遠只看到月球的同一面？';
const REPLY = '因為月球**自轉一圈**和**繞地球一圈**花的時間一樣，都約 27.3 天。它一邊繞、一邊以同樣的速度轉身，所以朝向地球的永遠是同一面。這叫**潮汐鎖定**：很久以前，地球的引力讓月球的自轉慢慢變慢，直到兩者同步。';

// ---------- background grid ----------
const grid = h('div', 'layer', '', film);
const COLS = 12, GX = 96, GW = (1920 - 2 * GX) / COLS;
for (let i = 0; i <= COLS; i++) {
  const l = h('div', 'gl', '', grid);
  l.style.left = `${GX + i * GW}px`;
  anim(l, { clipB: [[0.05 + i * 0.05, 0], [0.75 + i * 0.05, 1, E.out]] });
}

// ---------- the app window ----------
const stage = h('div', 'layer', '', film);
const win = h('div', 'win', '', stage);
const hero = h('iframe', '', '', win);
hero.src = `app.html?mode=app&side=${enc(SIDE.join('|'))}`;

type Cam = { x: number; y: number; s: number };
const RIGHT: Cam = { s: 1.08, x: 1920 - 80 - AW * 1.08, y: (1080 - AH * 1.08) / 2 };
const FULL: Cam = { s: 1.38, x: (1920 - AW * 1.38) / 2, y: (1080 - AH * 1.38) / 2 };
const focus = (ax: number, ay: number, s: number, sx = 960, sy = 540): Cam => ({ s, x: sx - ax * s, y: sy - ay * s });
let cam: Cam = { ...RIGHT };
const camSegs: { t: number; d: number; to: () => Cam; e: (k: number) => number; from?: Cam }[] = [];
const camTo = (t: number, d: number, to: Cam | (() => Cam), e = E.io) => camSegs.push({ t, d, to: typeof to === 'function' ? to : () => to, e });
const winKeys: { o: Key[]; y: Key[]; x: Key[] } = { o: [[0, 0]], y: [[0, 0]], x: [[0, 0]] };

const appDoc = () => hero.contentDocument!;
const appWin = () => hero.contentWindow as unknown as Window & { promo: Record<string, unknown> };
/** an element of the app, in app pixels */
const rect = (sel: string, i = 0) => {
  const els = appDoc().querySelectorAll<HTMLElement>(sel);
  const e = els[Math.min(i, els.length - 1)];
  if (!e) { console.log('missing', sel); return new DOMRect(AW / 2, AH / 2, 0, 0); }
  return e.getBoundingClientRect();
};
const center = (r: DOMRect): [number, number] => [r.x + r.width / 2, r.y + r.height / 2];
let wx = 0, wy = 0;
const toScreen = (ax: number, ay: number): [number, number] => [cam.x + wx + ax * cam.s, cam.y + wy + ay * cam.s];

onFrame((t) => {
  for (const sg of camSegs) {
    if (t < sg.t) continue;
    if (!sg.from) sg.from = { ...cam };
    if (t > sg.t + sg.d + 1 / 120) continue;
    const k = sg.e(Math.min(1, (t - sg.t) / sg.d));
    const to = sg.to();
    cam = { x: sg.from.x + (to.x - sg.from.x) * k, y: sg.from.y + (to.y - sg.from.y) * k, s: sg.from.s + (to.s - sg.from.s) * k };
  }
  wx = kf(winKeys.x, t); wy = kf(winKeys.y, t);
  const o = kf(winKeys.o, t);
  win.style.opacity = String(o);
  win.style.visibility = o < 0.001 ? 'hidden' : '';
  win.style.transform = `translate(${cam.x + wx}px, ${cam.y + wy}px) scale(${cam.s})`;
});

// ---------- cursor ----------
const cur = h('div', 'cursor', `<svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 31 L10.5 24.5 L15.5 36 L21 33.5 L16 22.5 L26 22.5 Z" fill="#1f3038" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>`, film);
const ring = h('div', 'cring', '', film);
let cx = 1500, cy = 1150, press = -9, ringAt = -9;
const curO: Key[] = [[0, 0]];
type Seg = { t: number; d: number; to: () => [number, number]; from?: [number, number]; e: (k: number) => number };
const curSegs: Seg[] = [];
let lastSent = '';
/** glide the pointer to a point; it then stays on that point (it follows the camera) until the next move */
const moveTo = (t: number, d: number, to: () => [number, number], e = E.io) => curSegs.push({ t, d, to, e });
const onApp = (sel: string, i = 0, dx = 0, dy = 0) => () => { const [x, y] = center(rect(sel, i)); return toScreen(x + dx, y + dy); };
const click = (t: number) => at(t, () => {
  press = now(); ringAt = now(); cue('click');
  input({ type: 'click', x: Math.round(cx), y: Math.round(cy) });
});
onFrame((t) => {
  let seg: Seg | undefined;
  for (const s of curSegs) if (t >= s.t) seg = s;
  if (seg) {
    if (!seg.from) seg.from = [cx, cy];
    const k = seg.e(Math.min(1, (t - seg.t) / seg.d));
    const [tx, ty] = seg.to();
    cx = seg.from[0] + (tx - seg.from[0]) * k; cy = seg.from[1] + (ty - seg.from[1]) * k;
  }
  const o = kf(curO, t);
  const p = t - press < 0.22 ? 1 - 0.14 * Math.sin(((t - press) / 0.22) * Math.PI) : 1;
  cur.style.opacity = String(o);
  cur.style.transform = `translate(${cx - 3}px, ${cy - 2}px) scale(${p})`;
  const rk = (t - ringAt) / 0.45;
  ring.style.opacity = rk >= 0 && rk < 1 ? String((1 - rk) * 0.9) : '0';
  ring.style.transform = `translate(${cx}px, ${cy}px) scale(${0.3 + rk * 0.9})`;
  if (o > 0.5) {
    const key = `${Math.round(cx)},${Math.round(cy)}`;
    if (key !== lastSent) { lastSent = key; input({ type: 'move', x: Math.round(cx), y: Math.round(cy), down: dragging }); }
  }
});
let dragging = false;

// ---------- chrome: corners, labels, timecode, progress ----------
const chrome = h('div', 'layer', '', film);
chrome.style.zIndex = '40';
for (const [l, t, bw] of [[28, 28, '2px 0 0 2px'], [1870, 28, '2px 2px 0 0'], [28, 1030, '0 0 2px 2px'], [1870, 1030, '0 2px 2px 0']] as [number, number, string][]) {
  const c = h('div', 'corner', '', chrome);
  Object.assign(c.style, { left: `${l}px`, top: `${t}px`, borderWidth: bw });
}
const lbl = h('div', 'abs mono', '', chrome);
Object.assign(lbl.style, { left: '72px', top: '44px' });
const rlbl = h('div', 'abs mono', 'AI 互動家教 · 高中全科', chrome);
Object.assign(rlbl.style, { left: 'auto', right: '72px', top: '44px' });
const tc = h('div', 'abs mono', '', chrome);
Object.assign(tc.style, { left: '72px', top: '1014px', color: 'var(--ink-3)' });
const ticks = h('div', 'abs ticks', '', chrome);
Object.assign(ticks.style, { left: 'auto', right: '72px', top: '1012px' });
const tickEls = Array.from({ length: 60 }, () => h('i', '', '', ticks));
const SECTIONS: [number, string][] = [[0, ''], [4.8, '01 / 07　提問'], [9.5, '02 / 07　生成'], [13.2, '03 / 07　逐步'], [17.2, '04 / 07　互動'], [22.8, '05 / 07　全科'], [34.6, '06 / 07　實測'], [40.4, '07 / 07　追問'], [46.8, '— 開始'], [51.4, '']];
onFrame((t) => {
  const s = [...SECTIONS].reverse().find(([a]) => t >= a)![1];
  const bin = (Math.floor(t * 3) * 2654435761 >>> 0).toString(2).slice(-6).replace(/0/g, 'O').replace(/1/g, 'I');
  lbl.innerHTML = `<span class="sq"></span>UNFOLD · ${bin}${s ? `　　${s}` : ''}`;
  const f = Math.floor(t * 60);
  const p2 = (n: number) => String(n).padStart(2, '0');
  tc.textContent = `00:00:${p2(Math.floor(f / 60))}:${p2(f % 60)}`;
  tickEls.forEach((e, i) => e.classList.toggle('on', i < t));
});
anim(chrome, { o: [[0.2, 0], [0.9, 1]] });

// ---------- helpers for type ----------
/** a line that slides up out of a mask */
function line(parent: HTMLElement, html: string, cls: string, x: number, y: number, size: number, tIn: number, tOut?: number, dy = 1.2) {
  const m = h('div', `abs mask ${cls}`, '', parent);
  Object.assign(m.style, { left: `${x}px`, top: `${y}px`, fontSize: `${size}px` });
  const s = h('span', '', html, m);
  const keys: Key[] = [[tIn, size * dy], [tIn + 0.7, 0, E.out]];
  if (tOut != null) keys.push([tOut, 0], [tOut + 0.45, -size * dy, E.in]);
  anim(s, { y: keys });
  return { m, s };
}
const hl = (el: Element, t: number, d = 0.45) => el.querySelectorAll<HTMLElement>('.hl').forEach((e) => anim(e, { hl: [[t, 0], [t + d, 1, E.out]] }));
const fade = (el: HTMLElement, a: number, b?: number, d = 0.4) => anim(el, { o: b == null ? [[a, 0], [a + d, 1]] : [[a, 0], [a + d, 1], [b, 1], [b + d, 0]] });

/** the section opener in the left column: big number, title lines, a sub line */
function opener(n: string, title: string[], sub: string, tIn: number, tOut: number) {
  const g = h('div', 'layer', '', film);
  line(g, n, 'num', 96, 178, 200, tIn, tOut, 1.1);
  const r = h('div', 'rule', '', g);
  Object.assign(r.style, { left: '96px', top: '408px', width: '410px' });
  anim(r, { s: [[tIn + 0.1, 0], [tIn + 0.8, 1, E.out]], o: [[tOut, 1], [tOut + 0.4, 0]] });
  // a scale on .rule is a scaleX here: keep it simple with clipR
  anim(r, { s: [[0, 1]], clipR: [[tIn + 0.1, 0], [tIn + 0.8, 1, E.out]], o: [[tOut, 1], [tOut + 0.4, 0]] });
  title.forEach((tl, i) => line(g, tl, 'disp', 96, 440 + i * 104, 88, tIn + 0.15 + i * 0.1, tOut));
  const s = h('div', 'abs sub', sub, g);
  Object.assign(s.style, { left: '96px', top: `${460 + title.length * 104}px`, width: '420px' });
  anim(s, { o: [[tIn + 0.5, 0], [tIn + 1, 1], [tOut, 1], [tOut + 0.4, 0]], y: [[tIn + 0.5, 20], [tIn + 1, 0, E.out]] });
  hl(g, tIn + 0.8);
  return g;
}

/** a caption card laid over the app */
function card(n: string, html: string, x: number, y: number, tIn: number, tOut: number) {
  const c = h('div', 'card', `<div class="mono"><span class="sq"></span>${n}</div><div class="disp" style="font-size:60px">${html}</div>`, film);
  Object.assign(c.style, { left: `${x}px`, top: `${y}px`, zIndex: '30' });
  anim(c, { o: [[tIn, 0], [tIn + 0.3, 1], [tOut, 1], [tOut + 0.3, 0]], y: [[tIn, 40], [tIn + 0.6, 0, E.out], [tOut, 0], [tOut + 0.4, 30, E.in]], clipR: [[tIn, 0], [tIn + 0.5, 1, E.out]] });
  hl(c, tIn + 0.45);
  return c;
}

// =====================================================================================
// 0 · INTRO  0 – 4.8
// =====================================================================================
const ART = `<svg width="200" height="118" viewBox="0 0 200 118" overflow="visible">
  <g class="p" style="--i:0"><path d="M18 92 54 70 54 30 18 52z" fill="#e9eff2" stroke="#1f3038" stroke-width="1.4" stroke-linejoin="round"/><path d="M26 60l20-12M26 68l14-8" stroke="#66767e" stroke-width="1.2" stroke-linecap="round"/></g>
  <g class="p" style="--i:1"><path d="M54 70 92 84 92 44 54 30z" fill="#fff" stroke="#1f3038" stroke-width="1.4" stroke-linejoin="round"/><path d="M64 46l18 6M64 54l14 5" stroke="#66767e" stroke-width="1.2" stroke-linecap="round"/></g>
  <g class="p" style="--i:2"><path d="M92 84 130 62 130 22 92 44z" fill="#e9eff2" stroke="#1f3038" stroke-width="1.4" stroke-linejoin="round"/></g>
  <g class="p" style="--i:3"><path d="M130 62 182 80 182 40 130 22z" fill="#fff" stroke="#1f3038" stroke-width="1.4" stroke-linejoin="round"/><path d="M140 36l30 10M140 44l22 7M140 52l26 9" stroke="#66767e" stroke-width="1.2" stroke-linecap="round"/></g>
  <circle class="dot" cx="111" cy="52" r="6" fill="#c4521b"/>
  <path class="base" d="M14 104h172" stroke="#c5d0d5" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;
function art(x: number, y: number, s: number, t: number, out?: number) {
  const a = h('div', 'abs', ART, film);
  Object.assign(a.style, { left: `${x}px`, top: `${y}px`, transformOrigin: '0 0' });
  a.querySelectorAll<SVGGElement>('.p').forEach((p, i) => {
    p.style.transformBox = 'fill-box';
    p.style.transformOrigin = i % 2 ? 'left center' : 'right center';
    anim(p, { o: [[t + i * 0.16, 0], [t + i * 0.16 + 0.12, 1]], s: [[t + i * 0.16, 0.2], [t + i * 0.16 + 0.55, 1, E.back]], y: [[t + i * 0.16, -24], [t + i * 0.16 + 0.55, 0, E.out]] });
  });
  const dot = a.querySelector<SVGCircleElement>('.dot')!;
  dot.style.transformBox = 'fill-box'; dot.style.transformOrigin = 'center';
  anim(dot, { s: [[t + 0.75, 0], [t + 1.1, 1, E.back]] });
  const base = a.querySelector<SVGPathElement>('.base')!;
  base.style.transformBox = 'fill-box'; base.style.transformOrigin = 'left';
  anim(base, { o: [[t, 0], [t + 0.5, 1]] });
  anim(a, out == null ? { s: [[0, s]] } : { s: [[0, s]], o: [[out, 1], [out + 0.4, 0]], y: [[out, 0], [out + 0.5, -60, E.in]] });
  at(t + 0.75, () => cue('pop'));
  return a;
}
art(96, 150, 2.7, 0.35, 4.3);
line(film, '問一個問題，', 'disp', 96, 520, 150, 1.3, 4.35);
const l2 = line(film, '<span class="hl">展開</span>成一堂課。', 'disp', 96, 700, 150, 1.75, 4.45);
hl(l2.m, 2.45, 0.5);
at(1.3, () => cue('whoosh'));
at(2.45, () => cue('hit'));
{
  const m = h('div', 'abs mono', '<span class="sq"></span>UNFOLD　—　把一個問題，變成一堂會動的課', film);
  Object.assign(m.style, { left: '1100px', top: '904px', fontSize: '17px' });
  fade(m, 2.9, 4.3);
}

// =====================================================================================
// 1 · ASK  4.8 – 9.5
// =====================================================================================
winKeys.o.push([4.7, 0], [5.2, 1]);
winKeys.y.push([4.69, 520], [4.7, 520], [5.7, 0, E.out]);
at(4.75, () => cue('whoosh'));
opener('01', ['問一個', '<span class="hl">問題</span>'], '一個好奇、一個卡住的地方，打字就好。', 5.0, 6.5);
curO.push([5.8, 0], [6.1, 1]);
moveTo(5.8, 0.75, onApp('.ask textarea', 0, -120, 0));
click(6.6);
camTo(6.5, 1.0, () => { const [x, y] = center(rect('.ask .box')); return focus(x - 40, y + 20, 2.1, 980, 560); }, E.io);
{
  const text = Q.moon;
  let t = 7.45;
  let seed = 7;
  for (const ch of text) {
    const at_ = t;
    at(at_, () => { input({ type: 'text', text: ch }); cue('key'); });
    seed = (seed * 9301 + 49297) % 233280;
    t += 0.11 + (seed / 233280) * 0.09;
  }
}
moveTo(9.0, 0.35, onApp('.ask .send'));
click(9.45);
at(9.45, () => cue('send'));
camTo(9.55, 0.75, RIGHT, E.io);

// =====================================================================================
// 2 · GENERATE  9.5 – 13.2
// =====================================================================================
opener('02', ['Claude', '<span class="hl">當場</span>寫好'], '每一步的解說、要畫的圖，一次寫好。實測約 30 秒，影片中加速。', 10.15, 11.7);
curO.push([9.8, 1], [10.1, 0]);
moveTo(9.8, 0.6, () => [cx + 120, cy + 260]);
camTo(11.75, 0.9, () => focus(600, 510, 1.7, 960, 540), E.io);
at(10.25, () => cue('stream'));

// =====================================================================================
// 3 · STEP BY STEP  13.2 – 17.2
// =====================================================================================
at(13.25, () => cue('ready'));
camTo(13.0, 0.9, FULL, E.io);
card('03 / 逐步', '一步一步，<span class="hl">畫給你看</span>', 72, 838, 13.6, 16.9);
curO.push([13.9, 0], [14.15, 1]);
moveTo(13.85, 0.5, onApp('.bar .go'));
click(14.45);
click(16.25);
at(14.45, () => cue('step'));
at(16.25, () => cue('step'));

// =====================================================================================
// 4 · HANDS ON  17.2 – 22.8
// =====================================================================================
/** the moon widget's range input, from the widget frame's box (it is cross-origin: geometry only) */
const slider = (v: number) => () => {
  const r = rect('.wbox .hw');
  const x0 = r.x + 16 + 52 + 10, x1 = r.right - 16, y = r.bottom - 19;
  return toScreen(x0 + 8 + ((x1 - x0 - 16) * v) / 360, y);
};
camTo(17.0, 1.0, () => { const r = rect('.wbox .hw'); return focus(r.x + r.width / 2, r.bottom - 175, 1.95, 1000, 520); }, E.io);
card('04 / 互動', '可以<span class="hl">動手</span>玩', 72, 838, 17.4, 21.2);
moveTo(17.3, 0.8, slider(90));
at(18.25, () => { press = now(); dragging = true; input({ type: 'down', x: Math.round(cx), y: Math.round(cy) }); cue('click'); });
{
  const d0 = 18.4, d1 = 20.9;
  const sl = slider(90), sr = slider(338);
  curSegs.push({ t: d0, d: d1 - d0, to: () => { const k = E.io(Math.min(1, (now() - d0) / (d1 - d0))); const a = sl(), b = sr(); return [a[0] + (b[0] - a[0]) * k, a[1]]; }, e: () => 1 });
}
at(20.9, () => cue('drag'));
at(21.05, () => { dragging = false; input({ type: 'up', x: Math.round(cx), y: Math.round(cy) }); });
camTo(21.2, 0.8, FULL, E.io);
moveTo(21.3, 0.6, onApp('.bar .go'));
click(22.05);
at(22.05, () => cue('step'));

// =====================================================================================
// 5 · EVERY SUBJECT  22.8 – 34.6
// =====================================================================================
const wipe = h('div', 'wipe', '', film);
wipe.style.zIndex = '20';
anim(wipe, { clipR: [[22.85, 0], [23.25, 1, E.io]], clipL: [[23.85, 1], [24.3, 0, E.io]] });
// clipL shrinks the shown part from the left: inset(0 0 0 (1-v)) — wipe it away to the right
at(22.85, () => cue('riser'));
at(23.25, () => cue('hit'));
const every = line(film, '每一科', 'disp', 140, 330, 330, 23.15, 23.8);
every.m.style.zIndex = '21';
every.s.style.color = '#fff';
winKeys.o.push([23.3, 1], [23.31, 0]);
curO.push([22.6, 1], [22.9, 0]);

type Tile = { q: string; n: string; sub: string; el: HTMLDivElement; fr: HTMLIFrameElement };
const TILES: [string, string, string][] = [
  [Q.doppler, '01', '物理'], [Q.dna, '02', '生物'], [Q.cold, '03', '歷史'],
  [Q.vertex, '04', '數學'], [Q.chushi, '05', '國文'], [Q.acid, '06', '化學'],
  [Q.industry, '07', '公民'], [Q.water, '08', '地科'], [Q.west, '09', '地理'],
  [Q.english, '10', '英文'], [Q.impression, '11', '藝術'], [Q.refraction, '12', '物理'],
];
const wall = h('div', 'wall', '', film);
const tiles: Tile[] = TILES.map(([q, n, sub]) => {
  const el = h('div', 'tile', '', wall);
  const fr = h('iframe', '', '', el);
  fr.src = `app.html?mode=lesson&step=1&side=${enc([q, ...SIDE.filter((s) => s !== q)].slice(0, 8).join('|'))}&open=${enc(q)}`;
  return { q, n, sub, el, fr };
});
const rowHead = h('div', 'layer', '', film);
const rh = line(rowHead, '高中<span class="hl">每一科</span>，都畫得出來。', 'disp', 96, 118, 82, 24.0, 30.7);
hl(rh.m, 24.5);

const COLX = [96, 684, 1272], COLW = 552, TS = COLW / AW;
function column(i: number, row: number, tIn: number, tOut: number) {
  const [, n, sub] = TILES[row * 3 + i];
  const g = h('div', 'layer', '', film);
  const x = COLX[i];
  const r = h('div', 'rule', '', g);
  Object.assign(r.style, { left: `${x}px`, top: '286px', width: `${COLW}px` });
  anim(r, { clipR: [[tIn, 0], [tIn + 0.6, 1, E.out]] });
  line(g, n, 'num', x, 304, 120, tIn + 0.05);
  line(g, sub, 'disp', x + 170, 330, 76, tIn + 0.15);
  const ttl = h('div', 'abs mono', TILES[row * 3 + i][0], g);
  Object.assign(ttl.style, { left: `${x}px`, top: '890px', fontSize: '16px', color: 'var(--ink-3)' });
  fade(ttl, tIn + 0.4);
  anim(g, { x: [[tOut, 0], [tOut + 0.6, -1920, E.io]] });
  if (row) anim(g, { x: [[tIn - 0.6, 1920], [tIn, 0, E.io], [tOut, 0], [tOut + 0.6, -1920, E.io]] });
}
// wall slots
const WS = 0.355, WG = 26, WX = (1920 - (4 * AW * WS + 3 * WG)) / 2, WY = (1080 - (3 * AH * WS + 2 * WG)) / 2 + 20;
const slot = (k: number) => ({ x: WX + (k % 4) * (AW * WS + WG), y: WY + Math.floor(k / 4) * (AH * WS + WG) });
const R1 = 24.1, R2 = 27.6, W0 = 30.8;
for (let i = 0; i < 3; i++) column(i, 0, R1 + i * 0.12, R2 - 0.6);
for (let i = 0; i < 3; i++) column(i, 1, R2 + i * 0.12, W0 - 0.3);
tiles.forEach((tl, k) => {
  const row = Math.floor(k / 3), i = k % 3;
  const sl = slot(k);
  const y0 = 520;
  if (k < 3) {
    anim(tl.el, {
      x: [[0, COLX[i]], [R2 - 0.6, COLX[i]], [R2, COLX[i] - 1920, E.io]], y: [[0, y0]], s: [[0, TS]],
      o: [[R1 + 0.2 + i * 0.12, 0], [R1 + 0.25 + i * 0.12, 1], [W0 - 1, 1], [W0 - 0.99, 0]],
      clipB: [[R1 + 0.2 + i * 0.12, 0], [R1 + 0.9 + i * 0.12, 1, E.out]],
    });
    // they come back into the wall
    anim(tl.el, {
      x: [[0, COLX[i]], [R2 - 0.6, COLX[i]], [R2, COLX[i] - 1920, E.io], [W0 + 0.2 + k * 0.05, sl.x - 700], [W0 + 1.1 + k * 0.05, sl.x, E.out]],
      y: [[0, y0], [W0 + 0.19, y0], [W0 + 0.2, sl.y]], s: [[0, TS], [W0 - 0.5, TS], [W0 + 0.2, WS]],
      o: [[R1 + 0.2 + i * 0.12, 0], [R1 + 0.25 + i * 0.12, 1], [R2, 1], [R2 + 0.01, 0], [W0 + 0.2 + k * 0.05, 0], [W0 + 0.5 + k * 0.05, 1]],
    });
  } else if (row === 1) {
    anim(tl.el, {
      x: [[0, COLX[i] + 1920], [R2 - 0.6 + i * 0.12, COLX[i] + 1920], [R2 + i * 0.12, COLX[i], E.io], [W0, COLX[i]], [W0 + 1.0, sl.x, E.io]],
      y: [[0, y0], [W0, y0], [W0 + 1.0, sl.y, E.io]], s: [[0, TS], [W0, TS], [W0 + 1.0, WS, E.io]],
      o: [[R2 - 0.62, 0], [R2 - 0.6, 1]],
    });
  } else {
    const d = W0 + 0.35 + (k - 6) * 0.08;
    anim(tl.el, { x: [[0, sl.x]], y: [[d, sl.y + 120], [d + 0.7, sl.y, E.out]], s: [[0, WS]], o: [[d, 0], [d + 0.35, 1]] });
  }
});
// the wall tilts and drifts
anim(wall, { rx: [[W0, 0], [W0 + 1.6, 16, E.io], [34.6, 18, E.lin]], rz: [[W0, 0], [W0 + 1.6, -5, E.io], [34.6, -6, E.lin]], s: [[W0, 1], [W0 + 1.6, 1.12, E.io], [34.6, 1.2, E.lin]], o: [[34.3, 1], [34.7, 0]] });
// every tile reads on: one step every 1.3 s
tiles.forEach((tl, k) => {
  const start = k < 3 ? R1 + 1.2 : k < 6 ? R2 + 1.0 : W0 + 1.5;
  for (let t = start + (k % 3) * 0.3; t < 34.4; t += 1.3) at(t, () => (tl.fr.contentWindow as unknown as { promo: { key: (k: string) => void } }).promo.key('ArrowRight'));
});
at(R2 - 0.6, () => cue('whoosh'));
at(W0, () => cue('whoosh'));
// the count over the wall
{
  const c = h('div', 'card', '', film);
  Object.assign(c.style, { left: '560px', top: '330px', width: '800px', zIndex: '30', padding: '34px 44px 38px' });
  c.innerHTML = `<div class="mono"><span class="sq"></span>SUBJECTS · 實測涵蓋</div><div style="display:flex;align-items:flex-end;gap:22px"><span class="num" style="font-size:230px">11</span><span class="disp" style="font-size:96px;padding-bottom:18px">個科目</span></div><div class="mono" style="font-size:19px;margin-top:14px;color:var(--ink-2)">數學・物理・化學・生物・地科・地理・歷史・公民・國文・英文・藝術</div>`;
  anim(c, { o: [[32.0, 0], [32.25, 1], [34.2, 1], [34.5, 0]], s: [[32.0, 0.92], [32.6, 1, E.out]], clipR: [[32.0, 0], [32.5, 1, E.out]] });
  at(32.0, () => cue('hit'));
}

// =====================================================================================
// 6 · NUMBERS  34.6 – 40.4
// =====================================================================================
const stats = h('div', 'layer', '', film);
{
  const big = line(stats, '30<span style="color:var(--ink-4)">/</span>30', 'num', 90, 120, 360, 34.75, 37.35, 1.0);
  void big;
  const meter = h('div', 'abs ticks', '', stats);
  Object.assign(meter.style, { left: '96px', top: '540px', gap: '9px' });
  const mt = Array.from({ length: 30 }, () => { const i = h('i', '', '', meter); i.style.height = '44px'; i.style.width = '9px'; return i; });
  for (let i = 0; i < 30; i++) at(35.0 + i * 0.05, () => { mt[i].classList.add('on'); if (i % 3 === 0) cue('tick'); });
  anim(meter, { o: [[34.9, 0], [35.0, 1], [37.7, 1], [38.0, 0]] });
  const scale = h('div', 'abs mono', '0', stats);
  Object.assign(scale.style, { left: '96px', top: '596px' });
  const scale2 = h('div', 'abs mono', '30 題', stats);
  Object.assign(scale2.style, { left: '1040px', top: '596px' });
  fade(scale, 35.0, 37.7); fade(scale2, 35.0, 37.7);
  const cap = line(stats, '高中 30 題實測，<span class="hl">全部</span>生成成功。', 'disp', 96, 660, 70, 35.6, 37.35);
  hl(cap.m, 36.3);
  at(36.3, () => cue('hit'));

  // time
  const tnum = h('div', 'abs mask num', '<span>00</span>', stats);
  Object.assign(tnum.style, { left: '90px', top: '120px', fontSize: '360px' });
  const tspan = tnum.querySelector('span')!;
  anim(tspan, { y: [[37.85, 380], [38.55, 0, E.out]] });
  onFrame((t) => { if (t > 37.8) tspan.innerHTML = `${String(Math.round(Math.min(1, (t - 38.0) / 1.0) ** 0.6 * 29)).padStart(2, '0')}<span style="font-size:120px;color:var(--acc);letter-spacing:0"> 秒</span>`; });
  anim(tnum, { o: [[40.1, 1], [40.4, 0]] });
  const cap2 = line(stats, '從提問，到一堂<span class="hl">畫好的課</span>。', 'disp', 96, 660, 70, 38.4, 40.0);
  hl(cap2.m, 39.0);
  const sub2 = h('div', 'abs mono', '中位數 29 秒 · 平均每堂 US$0.046 · 使用你自己的 Claude Code', stats);
  Object.assign(sub2.style, { left: '96px', top: '780px', fontSize: '18px' });
  fade(sub2, 38.9, 40.0);

  // right column
  const v = h('div', 'vrule', '', stats);
  Object.assign(v.style, { left: '1290px', top: '150px', height: '700px' });
  anim(v, { clipB: [[34.9, 0], [35.6, 1, E.out]], o: [[40.0, 1], [40.4, 0]] });
  const rows: [string, number][] = [['數學', 5], ['物理', 3], ['化學', 3], ['生物', 3], ['地科', 4], ['地理', 3], ['歷史', 3], ['公民', 3], ['國文', 1], ['英文', 1], ['藝術', 1]];
  const list = h('div', 'abs', '', stats);
  Object.assign(list.style, { left: '1340px', top: '150px', width: '480px' });
  list.innerHTML = `<div class="mono" style="margin-bottom:18px"><span class="sq"></span>EVAL · 30 QUESTIONS</div>` + rows.map(([s, n]) =>
    `<div style="display:flex;align-items:center;gap:16px;height:52px;border-bottom:1px solid var(--rule)"><span class="disp" style="font-size:28px;font-weight:700;width:90px">${s}</span><span style="flex:1;display:flex;gap:5px">${'<i style="display:block;width:22px;height:22px;background:var(--acc)"></i>'.repeat(n)}</span><span class="mono" style="font-size:20px">${n}</span></div>`).join('');
  [...list.children].forEach((e, i) => anim(e as HTMLElement, { o: [[35.1 + i * 0.06, 0], [35.4 + i * 0.06, 1]], x: [[35.1 + i * 0.06, 40], [35.6 + i * 0.06, 0, E.out]] }));
  anim(list, { o: [[40.0, 1], [40.4, 0]] });
  const cover = h('div', 'layer', '', stats);
  cover.style.background = 'var(--paper)';
  cover.style.zIndex = '-1';
  anim(stats, { o: [[34.39, 0], [34.4, 1], [40.4, 1], [40.41, 0]], clipB: [[34.4, 0], [34.9, 1, E.io]] });
}
stats.style.background = 'var(--paper)';
stats.style.zIndex = '25';
at(34.4, () => cue('whoosh'));

// =====================================================================================
// 7 · FOLLOW-UP  40.4 – 46.8
// =====================================================================================
camTo(34.0, 0.01, RIGHT);
for (const t of [26, 28.5]) at(t, () => (appWin().promo.key as (k: string) => void)('ArrowRight'));
winKeys.o.push([40.3, 0], [40.31, 1]);
winKeys.x.push([40.29, 0], [40.3, 1300], [41.2, 0, E.out]);
at(40.3, () => cue('whoosh'));
opener('07', ['卡住了？', '<span class="hl">接著問</span>'], '它記得整堂課，從你卡住的地方往下講。', 40.6, 42.55);
curO.push([41.3, 0], [41.5, 1]);
moveTo(41.3, 0.8, onApp('.sugg .sg', 0));
click(42.3);
at(42.3, () => cue('send'));
camTo(42.7, 1.0, () => focus(600, 440, 1.75, 960, 540), E.io);
curO.push([42.6, 1], [42.9, 0]);
at(43.0, () => cue('stream'));
at(45.2, () => cue('ready'));
camTo(45.9, 0.8, FULL, E.io);
// 開始
winKeys.y.push([46.7, 0], [47.4, 1200, E.in]);
winKeys.o.push([47.3, 1], [47.4, 0]);
at(46.8, () => cue('whoosh'));
{
  const g = h('div', 'layer', '', film);
  const head = line(g, '用你自己的 <span class="hl">Claude Code</span>', 'disp', 96, 118, 86, 47.2, 51.2);
  hl(head.m, 47.8);
  const cols: [string, string, string][] = [
    ['01', '你的帳號', '直接用你登入的 Claude Code 生成，不必另外設定 API。'],
    ['02', '自選模型', 'Sonnet、Opus、Haiku，思考深度分五段，按一下就換。'],
    ['03', '存在本機', '每一堂課都存在你的電腦裡，隨時接著上次讀下去。'],
  ];
  cols.forEach(([n, t, d], i) => {
    const x = COLX[i], tIn = 47.5 + i * 0.15;
    const r = h('div', 'rule', '', g);
    Object.assign(r.style, { left: `${x}px`, top: '420px', width: `${COLW}px` });
    anim(r, { clipR: [[tIn, 0], [tIn + 0.6, 1, E.out]] });
    line(g, n, 'num', x, 440, 150, tIn + 0.05);
    line(g, t, 'disp', x, 620, 80, tIn + 0.2);
    const s = h('div', 'abs sub', d, g);
    Object.assign(s.style, { left: `${x}px`, top: '740px', width: `${COLW - 40}px` });
    anim(s, { o: [[tIn + 0.5, 0], [tIn + 0.9, 1]], y: [[tIn + 0.5, 20], [tIn + 0.9, 0, E.out]] });
  });
  anim(g, { o: [[51.1, 1], [51.5, 0]], y: [[51.1, 0], [51.6, -80, E.in]] });
  at(47.8, () => cue('hit'));
}

// =====================================================================================
// 8 · OUTRO  51.4 – 60
// =====================================================================================
{
  art(960 - 100 * 2.2, 170, 2.2, 51.6);
  const wm = h('div', 'abs num', 'Unfold', film);
  Object.assign(wm.style, { left: '0', top: '470px', width: '1920px', textAlign: 'center', fontSize: '150px' });
  anim(wm, { o: [[52.3, 0], [52.7, 1]], y: [[52.3, 40], [53.0, 0, E.out]], blur: [[52.3, 12], [52.9, 0]] });
  const tg = h('div', 'abs disp', '今天想<span class="hl">弄懂</span>什麼？', film);
  Object.assign(tg.style, { left: '0', top: '660px', width: '1920px', textAlign: 'center', fontSize: '60px' });
  anim(tg, { o: [[52.9, 0], [53.3, 1]], y: [[52.9, 30], [53.5, 0, E.out]] });
  hl(tg, 53.6);
  at(52.3, () => cue('end'));
  const pill = h('div', 'pill', '<div class="in"><span></span><div class="go"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></div></div>', film);
  Object.assign(pill.style, { left: '560px', top: '810px', width: '800px' });
  anim(pill, { o: [[54.0, 0], [54.4, 1]], y: [[54.0, 30], [54.6, 0, E.out]] });
  const ps = pill.querySelector<HTMLSpanElement>('.in span')!;
  const ph = '一個問題、一個好奇、一個卡住的地方…';
  onFrame((t) => {
    pill.style.setProperty('--ga', `${(t * 60) % 360}deg`);
    const n = Math.max(0, Math.min(ph.length, Math.floor((t - 54.6) / 0.07)));
    const caret = Math.floor(t * 2) % 2 === 0 || (t > 54.6 && n < ph.length) ? '<i class="caret"></i>' : '<i class="caret" style="opacity:0"></i>';
    ps.innerHTML = t < 54.6 ? caret : ph.slice(0, n) + caret;
  });
  const foot = h('div', 'abs mono', 'Windows　·　搭配 Claude Code', film);
  Object.assign(foot.style, { left: '0', top: '950px', width: '1920px', textAlign: 'center', fontSize: '17px' });
  fade(foot, 55.2);
}
const out = h('div', 'layer', '', film);
out.style.background = 'var(--paper)';
out.style.zIndex = '60';
anim(out, { o: [[0, 0], [59.2, 0], [60, 1]] });

// =====================================================================================
// boot
// =====================================================================================
const start = run();
const frames = [hero, ...tiles.map((t) => t.fr)];
const ready = () => frames.every((f) => {
  const d = f.contentDocument;
  return d && d.readyState === 'complete' && d.querySelector('.app .panel') && d.fonts.status === 'loaded' && (f === hero || d.querySelector('.hw, .pw'));
});
const w = window as unknown as Record<string, unknown>;
w.__ready = () => !!ready() && document.fonts.status === 'loaded';
w.__cues = () => JSON.stringify(cues);
w.__dbg = () => JSON.stringify({ t: now(), step: appDoc().querySelector('.count')?.textContent, pend: !!appDoc().querySelector('.chap-pending'), status: appDoc().querySelector('.composer .status')?.textContent, sugg: [...appDoc().querySelectorAll('.sugg .sg')].map((e) => e.textContent), cx, cy, chip: center(rect('.sugg .sg')), scr: toScreen(...center(rect('.sugg .sg'))), hit: (document.elementFromPoint(cx, cy) as HTMLElement)?.tagName, inner: appDoc().elementFromPoint(...center(rect('.sugg .sg')))?.textContent });
w.__start = () => {
  const p = appWin().promo as { timing: Record<string, number>; followups: Record<string, unknown> };
  p.timing = { status: 250, step: 300, draw: 1100, reply: 2000 };
  p.followups[FOLLOW] = { mode: 'text', text: REPLY };
  start();
  return true;
};
if (!w.__input) {
  // plain browser preview: start once everything has loaded
  const poll = () => ((w.__ready as () => boolean)() ? (w.__start as () => void)() : setTimeout(poll, 200));
  poll();
}
