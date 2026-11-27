// Stills for checking: shoot.mjs <out.png> <path?query> [ms=1500] [w=1440] [h=900]
import { launch, openPage } from './cdp.mjs';
import { serve } from './serve.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
const WORK = process.env.FILM_WORK ?? path.join(os.tmpdir(), 'unfold-video');
const [, , out, rel, ms = '1500', W = '1440', H = '900'] = process.argv;
const srv = await serve(process.env.FILM_OUT ?? path.join(WORK, 'dist'));
const b = await launch({ width: +W, height: +H, userDataDir: path.join(WORK, 'prof-shoot') });
try {
  const p = await openPage(b, { url: `${srv.url}/${rel}`, width: +W, height: +H });
  const n = Math.round(+ms / p.interval);
  for (let i = 0; i < n; i++) { await p.advance(p.interval); await p.frame(false); }
  await p.advance(p.interval);
  fs.writeFileSync(out, await p.frame(true));
} finally { b.close(); srv.close(); }
