// Renders the film frame by frame and encodes it.
// Usage: node capture.mjs [--from s] [--to s] [--dsf 2] [--fps 60] [--out file.mp4] [--stills dir --every n]
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { launch, openPage } from './cdp.mjs';
import { serve } from './serve.mjs';

const WORK = process.env.FILM_WORK ?? path.join(os.tmpdir(), 'unfold-video');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const FROM = +arg('from', 0), TO = +arg('to', 60), DSF = +arg('dsf', 2), FPS = +arg('fps', 60);
const OUT = arg('out', path.join(WORK, 'film.mp4')), STILLS = arg('stills'), EVERY = +arg('every', 30);
const W = 1920, H = 1080;

const srv = await serve(process.env.FILM_OUT ?? path.join(WORK, 'dist'));
const b = await launch({ width: W, height: H, dsf: DSF, userDataDir: path.join(WORK, `prof-cap-${process.pid}`) });
const queue = [];
const p = await openPage(b, { url: `${srv.url}/film.html?capture=1`, width: W, height: H, dsf: DSF, onBinding: (c) => queue.push(c) });
const s = p.s;
const mouse = (type, x, y, extra = {}) => s('Input.dispatchMouseEvent', { type, x, y, ...extra });
// Input is acknowledged only after the renderer handles it, which takes a frame: send it all,
// let the next frame run, then collect the acknowledgements.
function drain() {
  const acks = [];
  while (queue.length) {
    const c = queue.shift();
    if (c.type === 'move') acks.push(mouse('mouseMoved', c.x, c.y, c.down ? { button: 'left', buttons: 1 } : {}));
    else if (c.type === 'click') acks.push(mouse('mousePressed', c.x, c.y, { button: 'left', buttons: 1, clickCount: 1 }), mouse('mouseReleased', c.x, c.y, { button: 'left', clickCount: 1 }));
    else if (c.type === 'down') acks.push(mouse('mousePressed', c.x, c.y, { button: 'left', buttons: 1, clickCount: 1 }));
    else if (c.type === 'up') acks.push(mouse('mouseReleased', c.x, c.y, { button: 'left', clickCount: 1 }));
    else if (c.type === 'text') acks.push(s('Input.insertText', { text: c.text }));
  }
  return Promise.all(acks);
}

// load everything (real time is fine here; the film has not started)
for (let i = 0; ; i++) {
  await p.advance(50); await p.frame(false);
  if (await p.evaluate('window.__ready && window.__ready()')) break;
  if (i > 600) throw new Error('film never became ready');
}
for (let i = 0; i < 12; i++) await p.tick(false);
await p.evaluate('window.__start()');

const step = 1000 / FPS;
const total = Math.round(TO * FPS), first = Math.round(FROM * FPS);
let ff;
if (!STILLS) {
  // one pass, two files: the supersampled frames as they are (4K at --dsf 2) and scaled to 1080p
  const big = OUT.replace(/\.mp4$/, '-4k.mp4');
  ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-filter_complex', `[0]split=2[a][b];[b]scale=${W}:${H}:flags=lanczos[s]`,
    '-map', '[s]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', OUT,
    ...(DSF > 1 ? ['-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', big] : [])], { stdio: ['pipe', 'inherit', 'inherit'] });
} else fs.mkdirSync(STILLS, { recursive: true });
const t0 = Date.now();
for (let f = 0; f < total; f++) {
  const acks = drain();
  const want = f >= first && (!STILLS || (f - first) % EVERY === 0);
  const img = await p.tick(want ? { format: 'jpeg', quality: STILLS ? 90 : 97 } : false);
  await acks;
  if (img) {
    if (STILLS) fs.writeFileSync(`${STILLS}/f${String(f).padStart(5, '0')}.jpg`, img);
    else if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once('drain', r));
  } else if (want) console.log('no image at frame', f);
  if (process.env.DBG && process.env.DBG.split(',').includes(String(f))) console.log(f, await p.evaluate('window.__dbg()'));
  if (f % 300 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, 'cues.json'), await p.evaluate('window.__cues()'));
if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('exit', r)); }
b.close(); srv.close();
console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
