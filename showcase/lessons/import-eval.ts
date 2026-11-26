// Copies the lessons an eval run wrote into the installed app's lesson folder, so they can be read
// in the app. Later runs win over earlier ones for the same question; a question already in the
// folder is skipped. Every lesson goes through the sidecar's checks first.
// Usage: bun showcase/lessons/import-eval.ts <runDir> [<runDir> ...]
import fs from 'fs';
import path from 'path';
import { problems } from '../../app/sidecar/check.ts';
import type { Lesson, LessonRecord } from '../../app/src/lesson.ts';

const runs = process.argv.slice(2);
if (!runs.length) throw new Error('usage: bun showcase/lessons/import-eval.ts <runDir> [<runDir> ...]');
const dir = path.join(process.env.APPDATA!, 'app.unfold.desktop', 'lessons');
fs.mkdirSync(dir, { recursive: true });
const have = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).question as string));

const byQ = new Map<string, { lesson: Lesson; cost?: LessonRecord['cost']; model?: string }>();
for (const run of runs) {
  for (const f of fs.readdirSync(run).filter((f) => /^q\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))) {
    const r = JSON.parse(fs.readFileSync(path.join(run, f), 'utf8'));
    if (r.lesson) byQ.set(r.question, { lesson: r.lesson, cost: r.cost, model: r.model });
  }
}

let t = Date.now();
for (const [question, { lesson, cost, model }] of byQ) {
  if (have.has(question)) { console.log('skip', question); continue; }
  const bad = problems(lesson.widget, lesson.steps);
  if (bad.length) { console.log('bad ', question, bad.join('; ')); continue; }
  const id = (t++).toString(16);
  const rec: LessonRecord = { id, question, status: 'ready', createdAt: t, step: 0, lesson, model: model ?? 'eval', ...(cost ? { cost } : {}) };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(rec, null, 2));
  console.log(id, lesson.title);
}
