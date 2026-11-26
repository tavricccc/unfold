// Collects the lessons the film shows from the app's lesson folder into data/lessons.json.
// Usage: node showcase/video/prep.mjs
import fs from 'fs';
import path from 'path';
const dir = path.join(process.env.APPDATA, 'app.unfold.desktop', 'lessons');
const out = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (r.status !== 'ready' || !r.lesson) continue;
  delete r.session;
  out.push(r);
}
fs.writeFileSync(new URL('./data/lessons.json', import.meta.url), JSON.stringify(out));
console.log(out.length, 'lessons');
