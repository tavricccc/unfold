import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Coordinates, Line, Mafs, MovablePoint, Plot as MPlot, Point, Polygon, Text, Vector } from 'mafs';
import 'mafs/core.css';
import { Icon } from '../icons';
import type { PlotItem, PlotSpec, Step } from '../lesson';
import { compile, safe, type Fn, type Scope } from './expr';
import type { WidgetHandle, WidgetProps } from './types';

const COLOR: Record<string, string> = { accent: 'var(--acc)', ink: 'var(--fg)', muted: 'var(--fg-3)' };
const TWEEN_MS = 900;
/** Decimals a slider value needs, from its step size. */
const decimals = (step: number) => Math.min(4, Math.max(0, Math.ceil(-Math.log10(Math.max(step, 1e-6)) - 1e-9)));
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Parameter values a step should show: initial values plus every `set` up to and including that step. */
function targetFor(spec: PlotSpec, steps: Step[], step: number): Scope {
  const s: Scope = {};
  for (const p of spec.params ?? []) s[p.name] = p.value;
  for (let i = 0; i <= step && i < steps.length; i++) for (const a of steps[i].set ?? []) s[a.name] = a.value;
  return s;
}

function sameScope(a: Scope, b: Scope): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-4) return false;
  return true;
}

type C = (s: Scope) => number;
interface Compiled { item: PlotItem; f: Record<string, C> }

function compileItems(items: PlotItem[]): { list: Compiled[]; error?: string } {
  const list: Compiled[] = [];
  try {
    for (const item of items) {
      const f: Record<string, Fn> = {};
      for (const k of ['expr', 'x', 'y', 'a', 'b', 'n', 'at'] as const) if (item[k] !== undefined) f[k] = compile(item[k]!);
      if (item.from) { f.fx = compile(item.from[0]); f.fy = compile(item.from[1]); }
      if (item.to) { f.tx = compile(item.to[0]); f.ty = compile(item.to[1]); }
      item.points?.forEach((pt, i) => { f[`px${i}`] = compile(pt[0]); f[`py${i}`] = compile(pt[1]); });
      list.push({ item, f });
    }
  } catch (e) {
    return { list: [], error: e instanceof Error ? e.message : String(e) };
  }
  return { list };
}

export const PlotWidget = forwardRef<WidgetHandle, WidgetProps & { spec: PlotSpec; steps: Step[] }>(
  function PlotWidget({ spec, steps, step, animate, onDirtyChange }, ref) {
    const { list, error } = useMemo(() => compileItems(spec.items), [spec]);
    const readouts = useMemo(() => {
      try { return (spec.readouts ?? []).map((r) => ({ ...r, f: compile(r.expr) })); } catch { return []; }
    }, [spec]);

    const [scope, setScope] = useState<Scope>(() => targetFor(spec, steps, step));
    const [explore, setExplore] = useState(false);
    const [viewKey, setViewKey] = useState(0);
    const cur = useRef(scope);
    cur.current = scope;
    const raf = useRef(0);
    const goal = useRef(scope);

    const stop = useCallback(() => { cancelAnimationFrame(raf.current); raf.current = 0; }, []);

    const tweenTo = useCallback((to: Scope, fromOverride?: Scope) => {
      goal.current = to;
      stop();
      const from = fromOverride ? { ...fromOverride } : { ...cur.current };
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = ease(Math.min(1, (now - t0) / TWEEN_MS));
        const s: Scope = {};
        for (const key of new Set([...Object.keys(from), ...Object.keys(to)])) {
          const a = from[key] ?? to[key], b = to[key] ?? a;
          s[key] = a + (b - a) * k;
        }
        setScope(s);
        raf.current = k < 1 ? requestAnimationFrame(tick) : 0;
      };
      raf.current = requestAnimationFrame(tick);
    }, [stop]);

    useEffect(() => {
      const to = targetFor(spec, steps, step);
      goal.current = to;
      stop();
      if (!animate) { setScope(to); return; }
      tweenTo(to);
      return stop;
    }, [spec, steps, step, animate, stop, tweenTo]);

    const stepTarget = useMemo(() => targetFor(spec, steps, step), [spec, steps, step]);
    const dirty = !sameScope(scope, stepTarget) || explore;
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

    useImperativeHandle(ref, () => ({
      busy: () => raf.current !== 0,
      finish: () => { stop(); setScope(goal.current); },
      replay: () => {
        const to = targetFor(spec, steps, step);
        const from = step > 0 ? targetFor(spec, steps, step - 1) : undefined;
        if (from && !sameScope(from, to)) tweenTo(to, from);
        else tweenTo(to);
      },
      reset: () => {
        if (explore) { setExplore(false); setViewKey((k) => k + 1); }
        tweenTo(targetFor(spec, steps, step));
      },
    }), [explore, spec, step, steps, stop, tweenTo]);

    // Mafs needs a pixel height.
    const box = useRef<HTMLDivElement>(null);
    const [h, setH] = useState(0);
    useLayoutEffect(() => {
      const el = box.current;
      if (!el) return;
      const ro = new ResizeObserver(() => setH(Math.floor(el.clientHeight)));
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    if (error) return <div className="empty">這張圖的算式有問題：{error}</div>;

    const visible = (it: PlotItem) => !it.show || (step >= it.show[0] && step <= (it.show[1] ?? Infinity));
    const sliders = (spec.params ?? []).filter((p) => p.slider);
    const set = (name: string, v: number) => { stop(); setScope((s) => ({ ...s, [name]: v })); };
    const resetOne = (name: string) => {
      const to = { ...cur.current, [name]: stepTarget[name] ?? cur.current[name] };
      tweenTo(to);
    };

    return (
      <div className="pw">
        <div className="pw-plot" ref={box}>
          <div className="pw-tools">
            <button
              type="button" className={`pw-chip${explore ? ' on' : ''}`}
              onClick={() => {
                if (explore) { setExplore(false); setViewKey((k) => k + 1); }
                else setExplore(true);
              }}
              title={explore ? '鎖定並重設視角' : '解鎖自由平移與縮放'}
            >
              <Icon.move />{explore ? '重設視角' : '自由平移'}
            </button>
          </div>
          {h > 0 && (
            <Mafs
              key={viewKey} height={h} viewBox={{ x: spec.x, y: spec.y, padding: 0.4 }}
              preserveAspectRatio={spec.equalAxes ? 'contain' : false}
              pan={explore} zoom={explore ? { min: 0.4, max: 6 } : false}
            >
              <Coordinates.Cartesian subdivisions={false} />
              {list.filter((c) => visible(c.item)).map((c, i) => <Item key={i} c={c} scope={scope} spec={spec} onDrag={set} />)}
            </Mafs>
          )}
        </div>
        {(readouts.length > 0 || sliders.length > 0) && (
          <div className="pw-under">
            {readouts.length > 0 && (
              <div className="meta pw-read" style={{ gridTemplateColumns: `repeat(${readouts.length}, minmax(0, 1fr))` }}>
                {readouts.map((r) => {
                  const v = safe(r.f, scope);
                  return <div key={r.label}>{r.label}<strong className="tnum">{Number.isFinite(v) ? v.toFixed(r.digits ?? 2) : '—'}</strong></div>;
                })}
              </div>
            )}
            {sliders.map((p) => {
              const span = p.max - p.min || 1;
              const st = p.step ?? span / 100;
              const val = scope[p.name] ?? p.value;
              const pct = Math.max(0, Math.min(100, ((val - p.min) / span) * 100));
              const changed = Math.abs(val - (stepTarget[p.name] ?? p.value)) > 1e-4;
              return (
                <label key={p.name} className={`pw-sl${changed ? ' chg' : ''}`} onDoubleClick={() => resetOne(p.name)} title="雙擊還原為這一步的數值">
                  <span>{p.label ?? p.name}</span>
                  <input
                    type="range" min={p.min} max={p.max} step={st} value={val}
                    onChange={(e) => set(p.name, +e.target.value)}
                    style={{ ['--p' as string]: `${pct}%` }}
                  />
                  <b className="tnum">{val.toFixed(decimals(st))}</b>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

function Item({ c, scope, spec, onDrag }: { c: Compiled; scope: Scope; spec: PlotSpec; onDrag: (name: string, v: number) => void }) {
  const { item, f } = c;
  const color = COLOR[item.color ?? 'ink'] ?? COLOR.ink;
  const style = item.dashed ? 'dashed' : 'solid';
  const v = (k: string) => safe(f[k], scope);
  const fx = (x: number) => safe(f.expr, { ...scope, x });
  const a = f.a ? v('a') : spec.x[0];
  const b = f.b ? v('b') : spec.x[1];

  switch (item.type) {
    case 'function': {
      if (!(b > a)) return null;
      const lx = a + (b - a) * 0.9;
      return <>
        <MPlot.OfX y={fx} domain={[a, b]} color={color} style={style} weight={item.color === 'accent' ? 3.5 : 2.5} />
        {item.label && Number.isFinite(fx(lx)) && <Text x={lx} y={fx(lx)} attach="n" attachDistance={14} color={color} size={15}>{item.label}</Text>}
      </>;
    }
    case 'area': {
      if (!(b > a)) return null;
      const N = 80, pts: [number, number][] = [[a, 0]];
      for (let i = 0; i <= N; i++) { const x = a + ((b - a) * i) / N; pts.push([x, fx(x)]); }
      pts.push([b, 0]);
      return <Polygon points={pts} color={color} fillOpacity={0.18} weight={0} />;
    }
    case 'riemann': {
      const n = Math.max(1, Math.min(200, Math.round(v('n'))));
      if (!(b > a) || !Number.isFinite(n)) return null;
      const w = (b - a) / n;
      return <>{Array.from({ length: n }, (_, i) => {
        const x0 = a + i * w, y = fx(x0);
        return <Polygon key={i} points={[[x0, 0], [x0 + w, 0], [x0 + w, y], [x0, y]]} color={color} fillOpacity={0.16} weight={1} />;
      })}</>;
    }
    case 'tangent': {
      const x0 = v('at'), y0 = fx(x0), d = 1e-4, slope = (fx(x0 + d) - fx(x0 - d)) / (2 * d);
      if (!Number.isFinite(y0) || !Number.isFinite(slope)) return null;
      return <Line.PointSlope point={[x0, y0]} slope={slope} color={color} style={style} weight={2} />;
    }
    case 'point': {
      const x = v('x'), y = v('y');
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const label = item.label && <Text x={x} y={y} attach="ne" attachDistance={12} color={color} size={14}>{item.label}</Text>;
      if (item.drag) {
        const name = item.drag;
        return <>
          <MovablePoint point={[x, y]} color={color} constrain={([px]) => [px, safe(f.y, { ...scope, [name]: px })]} onMove={([px]) => onDrag(name, px)} />
          {label}
        </>;
      }
      return <><Point x={x} y={y} color={color} />{label}</>;
    }
    case 'vector': case 'segment': {
      const p1: [number, number] = f.fx ? [v('fx'), v('fy')] : [0, 0];
      const p2: [number, number] = [v('tx'), v('ty')];
      if (![...p1, ...p2].every(Number.isFinite)) return null;
      const label = item.label && <Text x={p2[0]} y={p2[1]} attach="ne" attachDistance={10} color={color} size={14}>{item.label}</Text>;
      return <>
        {item.type === 'vector'
          ? <Vector tail={p1} tip={p2} color={color} style={style} weight={2.5} />
          : <Line.Segment point1={p1} point2={p2} color={color} style={style} weight={2} />}
        {label}
      </>;
    }
    case 'polygon': {
      const pts = (item.points ?? []).map((_, i) => [v(`px${i}`), v(`py${i}`)] as [number, number]);
      if (!pts.flat().every(Number.isFinite)) return null;
      return <Polygon points={pts} color={color} fillOpacity={0.15} weight={2} strokeStyle={style} />;
    }
    case 'text': {
      const x = v('x'), y = v('y');
      if (!Number.isFinite(x) || !Number.isFinite(y) || !item.text) return null;
      return <Text x={x} y={y} color={color} size={15}>{item.text}</Text>;
    }
    default:
      return null;
  }
}
