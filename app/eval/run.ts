// Runs the question set through the sidecar, each question in a fresh session of its own, and
// saves every answer with its cost, time and any repair. Spends API credit.
// Usage: bun eval/run.ts <outDir> [model=sonnet] [effort=low] [concurrency=4] [only=comma-separated indices]
import fs from 'fs';
import path from 'path';

const [out = 'R:/unfold-eval/run', model = 'sonnet', effort = 'low', conc = '4', only] = process.argv.slice(2);
const qs: string[] = JSON.parse(fs.readFileSync(path.join(import.meta.dir, 'questions.json'), 'utf8'));
const pick = only ? only.split(',').map(Number) : qs.map((_, i) => i);
fs.mkdirSync(out, { recursive: true });
const agent = path.join(import.meta.dir, '..', 'sidecar', 'agent.ts');

async function one(i: number) {
  const t0 = Date.now();
  const cwd = path.join(out, `q${i}`);
  fs.mkdirSync(cwd, { recursive: true });
  const p = Bun.spawn(['bun', agent], { cwd, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  p.stdin.write(JSON.stringify({ question: qs[i], model, effort }));
  p.stdin.end();
  const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  await p.exited;
  const events = stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { type: 'garbage', l }; } });
  const fin = events.find((e) => e.type === 'lesson' || e.type === 'error');
  const res = {
    i, question: qs[i], ms: Date.now() - t0, ok: fin?.type === 'lesson', error: fin?.message,
    repaired: /repairing:/.test(stderr), repairNote: stderr.match(/repairing: .*/)?.[0],
    kind: fin?.lesson?.widget?.kind, cost: fin?.cost, lesson: fin?.lesson,
  };
  fs.writeFileSync(path.join(out, `q${i}.json`), JSON.stringify(res, null, 2));
  console.log(`q${i} ${res.ok ? 'ok' : 'FAIL'} ${res.kind ?? ''} ${(res.ms / 1000).toFixed(0)}s $${res.cost?.usd?.toFixed(3) ?? '?'}${res.repaired ? ' (repaired)' : ''} ${qs[i]}${res.error ? ' :: ' + res.error : ''}`);
}

const queue = [...pick];
await Promise.all(Array.from({ length: Number(conc) }, async () => { while (queue.length) await one(queue.shift()!); }));
