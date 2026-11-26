// A small, safe math expression compiler for Claude-written plot specs (no eval).
// Grammar: numbers, names, + - * / ^, unary minus, parentheses, implicit multiplication ("2x", "3(x+1)"),
// functions sin cos tan asin acos atan sqrt abs exp ln log floor ceil round min max, constants pi e.

export type Scope = Record<string, number>;
export type Fn = (scope: Scope) => number;

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, sign: Math.sign,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: 'num'; v: number } | { t: 'name'; v: string } | { t: 'op'; v: string };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = src.replace(/π/g, 'pi').replace(/[×·]/g, '*').replace(/−/g, '-').replace(/\*\*/g, '^');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const name = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(s.slice(i));
    if (name) { out.push({ t: 'name', v: name[0] }); i += name[0].length; continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`看不懂的符號「${c}」`);
  }
  return out;
}

export function compile(src: string | number): Fn {
  if (typeof src === 'number') return () => src;
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const expect = (v: string) => { if (!isOp(v)) throw new Error(`缺少「${v}」：${src}`); p++; };

  // expr := term (('+'|'-') term)*
  const expr = (): Fn => {
    let l = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v, a = l, b = term();
      l = op === '+' ? (s) => a(s) + b(s) : (s) => a(s) - b(s);
    }
    return l;
  };
  // term := unary (('*'|'/'|implicit) unary)*
  const term = (): Fn => {
    let l = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[p++].v, a = l, b = unary();
        l = op === '*' ? (s) => a(s) * b(s) : (s) => a(s) / b(s);
      } else if (peek() && (peek().t !== 'op' || peek().v === '(')) {
        const a = l, b = unary();
        l = (s) => a(s) * b(s);
      } else return l;
    }
  };
  const unary = (): Fn => {
    if (isOp('-')) { p++; const a = unary(); return (s) => -a(s); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  };
  // power := atom ('^' unary)?   (right-assoc)
  const power = (): Fn => {
    const a = atom();
    if (isOp('^')) { p++; const b = unary(); return (s) => Math.pow(a(s), b(s)); }
    return a;
  };
  const atom = (): Fn => {
    const t = toks[p++];
    if (!t) throw new Error(`算式沒寫完：${src}`);
    if (t.t === 'num') return () => t.v;
    if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); return e; }
    if (t.t === 'name') {
      const f = FUNCS[t.v];
      if (f && isOp('(')) {
        p++;
        const args: Fn[] = [expr()];
        while (isOp(',')) { p++; args.push(expr()); }
        expect(')');
        return (s) => f(...args.map((g) => g(s)));
      }
      if (t.v in CONSTS) return () => CONSTS[t.v];
      const name = t.v;
      return (s) => {
        const v = s[name];
        if (v === undefined) throw new Error(`沒有定義的變數「${name}」`);
        return v;
      };
    }
    throw new Error(`算式寫錯了：${src}`);
  };

  const fn = expr();
  if (p < toks.length) throw new Error(`算式多了東西：${src}`);
  return fn;
}

/** Evaluates safely; NaN instead of throwing for a missing variable at runtime. */
export function safe(fn: Fn, scope: Scope): number {
  try { return fn(scope); } catch { return NaN; }
}
