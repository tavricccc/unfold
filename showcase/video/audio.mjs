// The soundtrack, synthesised from scratch: a 120 BPM bed (pad, bass, plucks, drums) shaped to the
// film's sections, plus sound effects on the cues the film wrote down while it was captured.
// Usage: node audio.mjs <cues.json> <out.wav>
import fs from 'fs';

const [, , cuesFile = 'R:/unfold-video/cues.json', out = 'R:/unfold-video/music.wav'] = process.argv;
const cues = JSON.parse(fs.readFileSync(cuesFile, 'utf8'));
const SR = 48000, LEN = 60, N = SR * LEN;
const L = new Float32Array(N), R = new Float32Array(N);         // dry mix
const RL = new Float32Array(N), RR = new Float32Array(N);       // reverb send
const DL = new Float32Array(N), DR = new Float32Array(N);       // delay send
const duck = new Float32Array(N).fill(1);                        // sidechain from the kick

const BPM = 120, BEAT = 60 / BPM, BAR = BEAT * 4;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function put(i, l, r, rev = 0, dly = 0) {
  if (i < 0 || i >= N) return;
  L[i] += l; R[i] += r;
  if (rev) { RL[i] += l * rev; RR[i] += r * rev; }
  if (dly) { DL[i] += l * dly; DR[i] += r * dly; }
}
const pan = (p) => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];

// ---------- sections: how much of each part plays at time t ----------
const SEG = [
  // [from, to, drums, bass, pad, pluck]
  [0, 4.8, 0, 0, 1, 0.6],
  [4.8, 22.8, 0.8, 1, 0.9, 0.8],
  [22.8, 34.6, 1, 1, 1, 1],
  [34.6, 40.4, 0.5, 0.8, 0.9, 0.6],
  [40.4, 51.4, 0.85, 1, 0.9, 0.9],
  [51.4, 60, 0, 0.5, 1, 0.7],
];
const level = (t, k) => { for (const s of SEG) if (t >= s[0] && t < s[1]) return s[k]; return 0; };

// ---------- harmony: F – G – Am – C, one chord a bar ----------
const CHORDS = [[53, 57, 60, 64], [55, 59, 62, 67], [57, 60, 64, 67], [48, 52, 55, 60]];
const chordAt = (t) => CHORDS[Math.floor(t / BAR) % 4];

// ---------- instruments ----------
function saw(ph) { return 2 * (ph - Math.floor(ph + 0.5)); }
function pad(t0, dur, notes, amp) {
  const a = 0.5, r = 1.2, n0 = Math.floor(t0 * SR), n1 = Math.min(N, Math.floor((t0 + dur + r) * SR));
  for (const m of notes) for (const det of [-0.08, 0, 0.07]) {
    const f = mtof(m + 12) * (1 + det / 100 * 12);
    let ph = rnd(), lp = 0;
    const [pl, pr] = pan(det * 8);
    for (let i = n0; i < n1; i++) {
      const t = (i - n0) / SR;
      const env = Math.min(1, t / a) * (t > dur ? Math.max(0, 1 - (t - dur) / r) : 1);
      ph += f / SR;
      lp += (saw(ph) - lp) * 0.11;
      const v = lp * env * amp * 0.06 * duck[i];
      put(i, v * pl, v * pr, 0.5);
    }
  }
}
function bass(t0, dur, m, amp) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(dur * SR));
  const f = mtof(m - 12);
  let ph = 0, lp = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const env = Math.min(1, t / 0.005) * Math.exp(-t * 3) * Math.min(1, (n1 - i) / (SR * 0.01));
    ph += f / SR;
    lp += ((Math.sin(2 * Math.PI * ph) + 0.35 * saw(ph)) - lp) * 0.2;
    const v = lp * env * amp * 0.17 * (0.4 + 0.6 * duck[i]);
    put(i, v, v);
  }
}
function pluck(t0, m, amp, p = 0) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + SR);
  const f = mtof(m);
  const [pl, pr] = pan(p);
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const env = Math.min(1, t / 0.002) * Math.exp(-t * 9);
    ph += f / SR;
    const v = (Math.sin(2 * Math.PI * ph) + 0.3 * Math.sin(4 * Math.PI * ph) * Math.exp(-t * 20)) * env * amp * 0.15;
    put(i, v * pl, v * pr, 0.35, 0.4);
  }
}
function kick(t0, amp) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(0.45 * SR));
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const f = 48 + 110 * Math.exp(-t * 28);
    ph += f / SR;
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t * 7) * amp * 0.5;
    put(i, v, v);
  }
  // duck everything else for a moment
  for (let i = n0; i < Math.min(N, n0 + Math.floor(0.3 * SR)); i++) duck[i] = Math.min(duck[i], 0.35 + 0.65 * ((i - n0) / (0.3 * SR)) ** 1.5);
}
function noiseHit(t0, dur, amp, decay, hp = 0.6, p = 0, rev = 0.2) {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(dur * SR));
  const [pl, pr] = pan(p);
  let prev = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR;
    const x = rnd() * 2 - 1;
    const y = x - prev * hp; prev = x;
    const v = y * Math.exp(-t * decay) * amp;
    put(i, v * pl, v * pr, rev);
  }
}
const hat = (t, a) => noiseHit(t, 0.07, 0.16 * a, 55, 0.95, 0.3, 0.08);
const clap = (t, a) => { for (const d of [0, 0.012, 0.024]) noiseHit(t + d, 0.18, 0.13 * a, 22, 0.8, -0.1, 0.4); };
function tone(t0, dur, f0, f1, amp, decay, p = 0, rev = 0.3, type = 'sin') {
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(dur * SR));
  const [pl, pr] = pan(p);
  let ph = 0;
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / SR, k = t / dur;
    const f = f0 * (f1 / f0) ** k;
    ph += f / SR;
    const w = type === 'tri' ? 2 * Math.abs(saw(ph)) - 1 : Math.sin(2 * Math.PI * ph);
    const v = w * Math.min(1, t / 0.003) * Math.exp(-t * decay) * amp;
    put(i, v * pl, v * pr, rev);
  }
}
function sweep(t0, dur, amp, up = true) {
  // band-limited noise whose brightness and level rise (or fall) across dur
  const n0 = Math.floor(t0 * SR), n1 = Math.min(N, n0 + Math.floor(dur * SR));
  let lp = 0, lp2 = 0;
  for (let i = n0; i < n1; i++) {
    const k = (i - n0) / (n1 - n0), kk = up ? k : 1 - k;
    const c = 0.02 + 0.5 * kk * kk;
    lp += (rnd() * 2 - 1 - lp) * c;
    lp2 += (lp - lp2) * c;
    const env = Math.sin(Math.PI * k) ** 1.5;
    const v = (lp - lp2 * 0.5) * env * amp;
    put(i, v * (0.8 + 0.2 * Math.sin(k * 9)), v * (0.8 - 0.2 * Math.sin(k * 9)), 0.4);
  }
}

// ---------- the bed ----------
for (let b = 0; b * BAR < LEN; b++) {
  const t = b * BAR;
  // kick first so the duck curve exists when the rest is drawn
  for (let q = 0; q < 4; q++) { const tq = t + q * BEAT, d = level(tq, 2); if (d) kick(tq, d); }
}
for (let b = 0; b * BAR < LEN; b++) {
  const t = b * BAR, ch = chordAt(t);
  pad(t, BAR, ch, level(t, 4) * (b === 0 ? 0.7 : 1));
  for (let e = 0; e < 8; e++) {
    const te = t + e * BEAT / 2, bl = level(te, 3);
    if (bl) bass(te, BEAT / 2 * 0.9, ch[0] - (e === 7 ? -7 : 0), bl * (e % 2 ? 0.7 : 1));
    const d = level(te, 2);
    if (d && e % 2 === 1) hat(te, d);
    if (d >= 1 && e % 2 === 0) hat(te, d * 0.4);
  }
  for (const q of [1, 3]) { const tq = t + q * BEAT, d = level(tq, 2); if (d >= 0.85) clap(tq, d); }
  // plucks: a sixteenth arpeggio over the chord
  const pat = [0, 2, 1, 3, 2, 1, 3, 0, 2, 3, 1, 2, 0, 3, 2, 1];
  for (let s = 0; s < 16; s++) {
    const ts = t + s * BEAT / 4, pl = level(ts, 5);
    if (!pl) continue;
    if (pl < 0.9 && s % 2) continue;
    pluck(ts, ch[pat[s]] + 12 + (s >= 12 && pl >= 1 ? 12 : 0), pl * (s % 4 === 0 ? 1 : 0.7), (s % 2 ? 0.4 : -0.4));
  }
}

// ---------- effects on cues ----------
for (const { t, kind } of cues) {
  switch (kind) {
    case 'key': noiseHit(t, 0.03, 0.05, 160, 0.9, (rnd() - 0.5) * 0.6, 0.05); tone(t, 0.03, 2400 + rnd() * 600, 1800, 0.012, 120, 0, 0); break;
    case 'click': noiseHit(t, 0.02, 0.09, 220, 0.95, 0.1, 0.05); tone(t, 0.05, 1600, 1100, 0.03, 70, 0, 0.1); break;
    case 'send': tone(t, 0.18, 520, 1320, 0.09, 12, 0, 0.4, 'tri'); break;
    case 'step': tone(t, 0.25, 880, 700, 0.06, 14, 0.2, 0.4); tone(t + 0.06, 0.3, 1320, 1320, 0.03, 12, -0.2, 0.5); break;
    case 'ready': tone(t, 1.2, 1318.5, 1318.5, 0.05, 4, -0.3, 0.6); tone(t + 0.09, 1.4, 1975.5, 1975.5, 0.04, 3.5, 0.3, 0.6); break;
    case 'stream': for (let k = 0; k < 10; k++) tone(t + k * 0.22, 0.12, 2000 + 300 * ((k * 5) % 7), 2000 + 300 * ((k * 5) % 7), 0.012, 25, (k % 2 ? 0.5 : -0.5), 0.5); break;
    case 'whoosh': sweep(t - 0.15, 0.6, 0.35); break;
    case 'riser': sweep(t - 0.5, 0.9, 0.4); tone(t - 0.5, 0.9, 220, 880, 0.03, 0.5, 0, 0.4); break;
    case 'hit': tone(t, 1.2, 70, 42, 0.5, 3.5, 0, 0.1); noiseHit(t, 0.5, 0.25, 9, 0.3, 0, 0.6); tone(t, 1.6, 523.25, 523.25, 0.04, 2, -0.4, 0.8); tone(t, 1.6, 659.25, 659.25, 0.035, 2, 0.4, 0.8); break;
    case 'pop': tone(t, 0.15, 600, 1200, 0.05, 20, 0, 0.4); break;
    case 'tick': tone(t, 0.04, 3000, 3000, 0.03, 90, 0.3, 0.1); break;
    case 'drag': break;
    case 'end':
      tone(t, 2.5, 65, 40, 0.5, 1.8, 0, 0.2); noiseHit(t, 1, 0.2, 5, 0.3, 0, 0.8);
      for (const [m, p] of [[53, -0.5], [60, -0.2], [64, 0.2], [67, 0.5], [72, 0]]) tone(t, 6, mtof(m + 12), mtof(m + 12), 0.035, 0.7, p, 0.8);
      break;
  }
}

// ---------- delay (dotted eighth, ping-pong) and reverb ----------
{
  const d = Math.floor(BEAT * 0.75 * SR);
  for (let i = d; i < N; i++) {
    const l = DL[i] + DR[i - d] * 0.42, r = DR[i] + DL[i - d] * 0.42;
    DL[i] = l; DR[i] = r;
  }
  for (let i = 0; i < N; i++) { L[i] += DR[i] * 0.3; R[i] += DL[i] * 0.3; RL[i] += DR[i] * 0.2; RR[i] += DL[i] * 0.2; }
}
function reverb(inp, spread) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((n) => ({ buf: new Float32Array(n + spread), i: 0, lp: 0 }));
  const aps = [556, 441, 341, 225].map((n) => ({ buf: new Float32Array(n + spread), i: 0 }));
  const outp = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = inp[n] * 0.015;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.lp = o * 0.7 + c.lp * 0.3;
      c.buf[c.i] = x + c.lp * 0.86;
      c.i = (c.i + 1) % c.buf.length;
      y += o;
    }
    for (const a of aps) {
      const o = a.buf[a.i];
      a.buf[a.i] = y + o * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = o - y;
    }
    outp[n] = y;
  }
  return outp;
}
const wl = reverb(RL, 0), wr = reverb(RR, 23);

// ---------- master ----------
const outL = new Float32Array(N), outR = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = Math.min(1, t / 0.05) * Math.min(1, (LEN - t) / 1.5);
  outL[i] = Math.tanh((L[i] + wl[i] * 1.1) * 1.1) * fade;
  outR[i] = Math.tanh((R[i] + wr[i] * 1.1) * 1.1) * fade;
  peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
}
const g = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[i] * g)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[i] * g)) * 32767), 46 + i * 4);
}
fs.writeFileSync(out, buf);
console.log('wrote', out, 'peak', peak.toFixed(3));
