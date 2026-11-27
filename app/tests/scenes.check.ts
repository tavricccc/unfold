// Scenes, boards and live playback: how chapters read stored lessons, old and new, and how many
// streamed steps may play.
import { chaptersOf, sceneAt, sceneOf } from '../src/chapters.ts';
import { playableSteps } from '../sidecar/check.ts';
import { parsePartial } from '../sidecar/partial.ts';
import type { LessonRecord, Step, Widget } from '../src/lesson.ts';

let bad = 0;
const eq = (what: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
};

const html = (n: string): Widget => ({ kind: 'html', html: `<script>U.onStep(() => {}) /* ${n} */</script>` });
const points: Widget = { kind: 'points', points: { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] } };
const base = { id: 'x', question: 'q', createdAt: 0, step: 0 } as const;

// a chapter with two scenes, boards carried within a scene and cleared by a new one
const steps: Step[] = [
  { text: 's0', scene: html('one'), task: 't1', board: { lines: ['1 + 1 = 2'] } },
  { text: 's1' },
  { text: 's2', board: {} },
  { text: 's3', scene: points, task: 't2', reveal: ['a'] },
  { text: 's4', reveal: ['b'] },
];
const rec: LessonRecord = { ...base, status: 'ready', lesson: { title: 'T', subject: 'math', crumbs: [], steps, suggestions: [] } };
let ch = chaptersOf(rec)[0];
eq('versions', ch.versions.map((w) => w.kind), ['html', 'points']);
eq('from', ch.from, [0, 3]);
eq('tasks', ch.tasks, ['t1', 't1', 't1', 't2', 't2']);
eq('boards', ch.boards.map((b) => b?.lines?.[0] ?? null), ['1 + 1 = 2', '1 + 1 = 2', null, null, null]);
eq('item versions', ch.items.map((it) => it.version), [0, 0, 0, 1, 1]);
eq('scene 1 steps', sceneOf(ch, 1).steps.map((s) => s.text), ['s3', 's4']);
eq('scene 0 steps', sceneOf(ch, 0).steps.map((s) => s.text), ['s0', 's1', 's2']);
eq('scene of step 4', sceneAt(ch, 4), { scene: 1, index: 1, from: 3 });

// an extend that edits the last scene keeps its numbering; one that opens a scene starts at 0
const more = [
  { question: 'f1', mode: 'extend' as const, at: 0, steps: [{ text: 's5', reveal: ['a'] }], edited: points },
  { question: 'f2', mode: 'extend' as const, at: 0, steps: [{ text: 's6', scene: html('two'), task: 't3' }] },
];
ch = chaptersOf({ ...rec, more })[0];
eq('extend from', ch.from, [0, 3, 3, 6]);
eq('edited scene steps', sceneOf(ch, 2).steps.map((s) => s.text), ['s3', 's4', 's5']);
eq('extend tasks', ch.tasks.slice(5), ['t2', 't3']);
eq('extend asked', ch.items.filter((it) => it.asked).map((it) => it.text), ['s5', 's6']);

// lessons saved before scenes: one widget, one task, and a legacy redraw plays from step 0
const old: LessonRecord = {
  ...base, status: 'ready',
  lesson: { title: 'T', subject: 'math', crumbs: [], widget: html('old'), task: 'old task', steps: [{ text: 'a' }, { text: 'b' }], suggestions: [] },
  more: [{ question: 'f', mode: 'extend', at: 0, steps: [{ text: 'c' }], widget: html('redraw'), task: 'redrawn' }],
};
ch = chaptersOf(old)[0];
eq('legacy from', ch.from, [0, 0]);
eq('legacy tasks', ch.tasks, ['old task', 'old task', 'redrawn']);
eq('legacy redraw steps', sceneOf(ch, 1).steps.map((s) => s.text), ['a', 'b', 'c']);

// live: a new lesson plays its ready steps; a pending chapter joins at the end
const live: LessonRecord = { ...base, status: 'generating', draft: { mode: 'chapter', title: 'L', steps: [...steps.slice(0, 2), { text: 's2' }], ready: 2 } };
eq('live new lesson', chaptersOf(live, true).map((c) => [c.live, c.items.length]), [[true, 2]]);
eq('not live without the flag', chaptersOf(live).length, 0);
const pend: LessonRecord = { ...rec, pending: { question: 'p', status: 'generating', draft: { mode: 'chapter', title: 'P', steps: steps.slice(0, 1), ready: 1 } } };
eq('live pending chapter', chaptersOf(pend, true).map((c) => [!!c.live, c.items.length]), [[false, 5], [true, 1]]);
eq('live chapter part', chaptersOf(pend, true)[1].items[0].part, 1);

// playable steps: a step is whole once the next began; a kit scene waits until its steps are done
eq('playable html', playableSteps(steps.slice(0, 3), false), 2);
eq('playable closed html', playableSteps(steps.slice(0, 3), true), 3);
eq('kit scene waits', playableSteps(steps.slice(0, 5), false), 3);
eq('kit scene done', playableSteps(steps, true), 5);
eq('no first scene', playableSteps([{ text: 'a' }, { text: 'b' }], true), 0);
eq('broken scene stops', playableSteps([{ text: 'a', scene: { kind: 'html', html: '<script>if (</script>' } }, { text: 'b' }], true), 0);

// streamed JSON: steps grow, and a step's scene is whole only once the next step has begun
const full = JSON.stringify({ mode: 'chapter', title: 'T', steps, suggestions: ['x', 'y'] });
let last = 0;
for (let n = 1; n <= full.length; n++) {
  const v = parsePartial(full.slice(0, n)) as { steps?: Step[]; suggestions?: unknown } | undefined;
  if (!v?.steps) continue;
  const r = playableSteps(v.steps, 'suggestions' in v);
  if (r < last) { bad++; console.log('playable went backwards at', n); break; }
  for (let k = 0; k < r; k++) if (JSON.stringify(v.steps[k]) !== JSON.stringify(steps[k])) { bad++; console.log('played an unfinished step at', n, k); break; }
  last = r;
}
eq('streamed to the end', last, steps.length);

console.log(bad ? `${bad} failed` : 'scene checks ok');
if (bad) process.exit(1);
