import { compile } from '../src/widgets/expr.ts';
const cases: [string, Record<string, number>, number][] = [
  ['2x^2 + 3', { x: 2 }, 11], ['-x^2', { x: 3 }, -9], ['2^3^2', {}, 512], ['sin(pi/2)', {}, 1],
  ['3(x+1)', { x: 1 }, 6], ['a*x^2+b*x+c', { a: 1, b: -2, c: 1, x: 1 }, 0], ['max(1, x, 3)', { x: 5 }, 5],
  ['x/2/2', { x: 8 }, 2], ['2pi', {}, 2 * Math.PI], ['e^(ln(4))', {}, 4], ['sqrt(abs(-16))', {}, 4], ['1 - -2', {}, 3],
];
let bad = 0;
for (const [s, sc, want] of cases) { const got = compile(s)(sc); if (Math.abs(got - want) > 1e-9) { bad++; console.log('FAIL', s, got, want); } }
for (const s of ['2 +', 'foo(', 'x $ 2', '(1']) { try { compile(s); bad++; console.log('should throw', s); } catch {} }
console.log(bad ? `${bad} failed` : `all ${cases.length + 4} passed`);
if (bad) process.exit(1);
