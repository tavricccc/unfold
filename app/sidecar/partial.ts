// Parses the longest complete prefix of a JSON document that is still being streamed.
// Only finished values are kept: a half-written string or number is dropped, never guessed.

export function parsePartial(src: string): unknown {
  const stack: ('{' | '[')[] = [];
  let inStr = false, esc = false, afterColon = false;
  let safe = { idx: -1, stack: [] as ('{' | '[')[] };
  const mark = (idx: number) => { safe = { idx, stack: stack.slice() }; };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') {
        inStr = false;
        const top = stack[stack.length - 1];
        if (top === '[' || (top === '{' && afterColon)) { afterColon = false; mark(i + 1); }
      }
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') { stack.push(c); afterColon = false; if (c === '[') mark(i + 1); }
    else if (c === '}' || c === ']') { stack.pop(); afterColon = false; mark(i + 1); }
    else if (c === ':') afterColon = true;
    else if (c === ',') { afterColon = false; mark(i); }
  }
  if (safe.idx < 0) return undefined;
  const closers = safe.stack.slice().reverse().map((b) => (b === '{' ? '}' : ']')).join('');
  try {
    return JSON.parse(src.slice(0, safe.idx) + closers);
  } catch {
    return undefined;
  }
}
