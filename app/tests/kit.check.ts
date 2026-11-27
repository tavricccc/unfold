import { problems } from '../sidecar/check.ts';
import type { Step, Widget } from '../src/lesson.ts';

let bad = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    bad++;
    console.log('FAIL:', msg);
  }
};

// valid code widget
const validCode: Widget = {
  kind: 'code',
  code: {
    title: 'sum.py',
    language: 'python',
    lines: ['total = 0', 'for x in [1, 2]:', '    total += x', 'print(total)'],
    states: [
      { id: 's0', lines: [1], vars: { total: '0' } },
      { id: 's1', lines: [2, 3], vars: { total: '1', x: '1' } },
      { id: 's2', lines: [4], vars: { total: '3' }, output: '3' },
    ],
  },
};
const codeSteps: Step[] = [
  { text: 'init', focus: ['s0'] },
  { text: 'loop', focus: ['s1'] },
  { text: 'done', focus: ['s2'] },
];
assert(problems(validCode, codeSteps).length === 0, 'valid code widget should have no problems');

// invalid code line range and missing state id
const badCode: Widget = {
  kind: 'code',
  code: {
    lines: ['x = 1'],
    states: [{ id: 's0', lines: [2] }],
  },
};
const badCodeErrs = problems(badCode, [{ text: 'a', focus: ['nope'] }]);
assert(badCodeErrs.some((e) => e.includes('outside 1..1')), 'should catch out-of-range line number');
assert(badCodeErrs.some((e) => e.includes('nope')), 'should catch unknown code state id');

// valid quiz widget
const validQuiz: Widget = {
  kind: 'quiz',
  quiz: {
    title: 'check',
    questions: [
      { id: 'q1', prompt: '1+1?', options: ['1', '2'], answer: [1], explanation: '2' },
      { id: 'q2', prompt: 'even?', options: ['2', '3', '4'], answer: [0, 2], explanation: '2 and 4' },
    ],
  },
};
assert(problems(validQuiz, [{ text: 'first', focus: ['q1'] }, { text: 'second', focus: ['q2'] }]).length === 0, 'valid quiz should pass');

// invalid quiz answer index and option count
const badQuiz: Widget = {
  kind: 'quiz',
  quiz: {
    questions: [
      { id: 'q1', prompt: 'x', options: ['only one'], answer: [3], explanation: 'e' },
    ],
  },
};
const badQuizErrs = problems(badQuiz, [{ text: 'a', focus: ['q1'] }]);
assert(badQuizErrs.some((e) => e.includes('at least 2 options')), 'should catch <2 options');
assert(badQuizErrs.some((e) => e.includes('out of range')), 'should catch out-of-range answer index');

// valid architecture widget: groups, a loose user, edges and a flowchart shape
const arch: Widget = {
  kind: 'architecture',
  architecture: {
    groups: [{ id: 'ui', label: '前端' }, { id: 'be', label: '後端' }],
    nodes: [
      { id: 'u', label: '使用者', kind: 'user' },
      { id: 'web', label: 'React', group: 'ui', kind: 'client' },
      { id: 'api', label: 'API', group: 'be', kind: 'service' },
      { id: 'db', label: '資料庫', group: 'be', kind: 'db' },
    ],
    edges: [{ from: 'u', to: 'web' }, { from: 'web', to: 'api', label: 'HTTP' }, { from: 'api', to: 'db', dashed: true }],
  },
};
assert(problems(arch, [{ text: 'a', reveal: ['ui'] }, { text: 'b', focus: ['be', 'web>api'] }]).length === 0, 'valid architecture should pass');
const badArch: Widget = {
  kind: 'architecture',
  architecture: {
    groups: [{ id: 'ui', label: '前端' }],
    nodes: [{ id: 'web', label: 'React', group: 'nope', icon: 'no-such-icon' }],
    edges: [{ from: 'web', to: 'ghost' }],
  },
};
const badArchErrs = problems(badArch, [{ text: 'a', focus: ['web>api'] }]);
assert(badArchErrs.some((e) => e.includes('group "nope"')), 'should catch an unknown group');
assert(badArchErrs.some((e) => e.includes('ghost')), 'should catch an edge to a missing node');
assert(badArchErrs.some((e) => e.includes('no-such-icon')), 'should catch an unknown icon');
assert(badArchErrs.some((e) => e.includes('web>api')), 'should catch an unknown step id');

console.log(bad ? `${bad} failed` : 'kit checks ok');
if (bad) process.exit(1);
