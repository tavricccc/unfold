// A tiny timeline: every value on screen is a function of t (seconds since the film started).
// Under capture, time is Chrome's virtual time, so each frame is exact and repeatable.

export type Ease = (k: number) => number;
export const ease = {
  lin: (k: number) => k,
  out: (k: number) => 1 - (1 - k) ** 4,
  out2: (k: number) => 1 - (1 - k) ** 2,
  in: (k: number) => k ** 3,
  io: (k: number) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2),
  io2: (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2),
  back: (k: number) => { const c = 1.6; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
  expo: (k: number) => (k >= 1 ? 1 : 1 - 2 ** (-10 * k)),
};

/** [time, value, easing of the segment that ends here] */
export type Key = [number, number, Ease?];

export function kf(keys: Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e = ease.io] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const k = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * e(k);
    }
  }
  return keys[keys.length - 1][1];
}

type Prop = 'o' | 'x' | 'y' | 's' | 'r' | 'hl' | 'clipB' | 'clipR' | 'clipL' | 'blur' | 'rx' | 'rz';
const DEF: Record<Prop, number> = { o: 1, x: 0, y: 0, s: 1, r: 0, hl: 0, clipB: 1, clipR: 1, clipL: 1, blur: 0, rx: 0, rz: 0 };

const animated = new Map<HTMLElement | SVGElement, Partial<Record<Prop, Key[]>>>();
const events: { t: number; f: () => void; done?: boolean }[] = [];
const every: ((t: number) => void)[] = [];

/** Animate props of an element along keys. */
export function anim(el: HTMLElement | SVGElement, props: Partial<Record<Prop, Key[]>>) {
  animated.set(el, { ...(animated.get(el) ?? {}), ...props });
}
export const at = (t: number, f: () => void) => events.push({ t, f });
export const onFrame = (f: (t: number) => void) => every.push(f);

function apply(t: number) {
  for (const [el, props] of animated) {
    const v = { ...DEF } as Record<Prop, number>;
    for (const p in props) v[p as Prop] = kf(props[p as Prop]!, t);
    const st = (el as HTMLElement).style;
    st.opacity = String(v.o);
    st.visibility = v.o <= 0.001 ? 'hidden' : '';
    const rot = (v.rx ? ` perspective(2400px) rotateX(${v.rx}deg)` : '') + (v.rz ? ` rotate(${v.rz}deg)` : '') + (v.r ? ` rotate(${v.r}deg)` : '');
    st.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})${rot}`;
    if ('hl' in props) st.setProperty('--hl', String(v.hl));
    if ('clipB' in props || 'clipR' in props || 'clipL' in props) st.clipPath = `inset(0 ${(1 - v.clipR) * 100}% ${(1 - v.clipB) * 100}% ${(1 - v.clipL) * 100}%)`;
    if ('blur' in props) st.filter = v.blur > 0.01 ? `blur(${v.blur}px)` : '';
  }
}

let t0 = -1;
export const now = () => (t0 < 0 ? 0 : (performance.now() - t0) / 1000);

export function run(onTick?: (t: number) => void) {
  const loop = () => {
    const t = now();
    if (t0 >= 0) {
      for (const e of events) if (!e.done && t >= e.t) { e.done = true; e.f(); }
      for (const f of every) f(t);
      apply(t);
      onTick?.(t);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => { t0 = performance.now(); };
}

/** Sound cues for the soundtrack, written down at the time they happen. */
export const cues: { t: number; kind: string; v?: number }[] = [];
export const cue = (kind: string, v?: number) => cues.push({ t: +now().toFixed(4), kind, v });

/** Real input, dispatched by the capture script through the DevTools protocol (a no-op in a plain browser). */
export function input(cmd: Record<string, unknown>) {
  const b = (window as unknown as { __input?: (s: string) => void }).__input;
  if (b) b(JSON.stringify(cmd));
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}
