import { parsePartial } from '../sidecar/partial.ts';
const full = JSON.stringify({ title: '導數：斜率', subject: 'math', crumbs: ['數學', '微積分'], steps: [{ text: '第一步 "引號" 和 \\ 斜線' }, { text: '第二步', set: [{ name: 'a', value: 1.5 }] }], task: 't', widget: { kind: 'plot', plot: { x: [-1, 2] } } });
let bad = 0, lastSteps = -1;
for (let n = 1; n <= full.length; n++) {
  const v = parsePartial(full.slice(0, n)) as any;
  if (v === undefined) continue;
  const steps = v.steps?.length ?? 0;
  if (steps < lastSteps) { bad++; console.log('steps went backwards at', n); }
  lastSteps = steps;
  for (const s of v.steps ?? []) if (typeof s.text !== 'string' || !full.includes(JSON.stringify(s.text))) { bad++; console.log('bad step text at', n, s); break; }
  if (v.title !== undefined && v.title !== '導數：斜率') { bad++; console.log('partial title leaked at', n, v.title); }
}
const end = parsePartial(full);
if (JSON.stringify(end) !== full) { bad++; console.log('full parse mismatch'); }
console.log(bad ? `${bad} failed` : 'partial parser ok');
if (bad) process.exit(1);
