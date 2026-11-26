import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Step } from '../lesson';
import type { WidgetHandle, WidgetProps } from './types';

interface Item { id: number; v: number }
interface Frame {
  arr: Item[];
  /** left index of the pair being compared, -1 when nothing is */
  at: number;
  swapped: boolean;
  /** positions >= sortedFrom are in their final place */
  sortedFrom: number;
  comps: number;
  swaps: number;
}

function trace(values: number[]) {
  const n = values.length;
  let arr = values.map((v, id) => ({ id, v }));
  let comps = 0, swaps = 0;
  const frames: Frame[] = [{ arr, at: -1, swapped: false, sortedFrom: n, comps, swaps }];
  const passEnd = [0];
  for (let p = 0; p < n - 1; p++) {
    const end = n - 1 - p;
    for (let j = 0; j < end; j++) {
      comps++;
      const swapped = arr[j].v > arr[j + 1].v;
      if (swapped) {
        arr = arr.slice();
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swaps++;
      }
      frames.push({ arr, at: j, swapped, sortedFrom: j === end - 1 ? end : n - p, comps, swaps });
    }
    passEnd.push(frames.length - 1);
  }
  // after the last pass everything is in place
  frames[frames.length - 1] = { ...frames[frames.length - 1], sortedFrom: 0 };
  return { frames, passEnd };
}

const CODE: [string, string][] = [
  ['1', 'a = [{V}]'],
  ['2', 'for end in range(len(a) - 1, 0, -1):'],
  ['3', '    for j in range(end):'],
  ['4', '        if a[j] > a[j + 1]:'],
  ['5', '            a[j], a[j + 1] = a[j + 1], a[j]'],
];
const KW = /\b(for|in|if)\b/;
const isKw = (s: string) => s === 'for' || s === 'in' || s === 'if';

const TICK = 520;

export const BubbleSort = forwardRef<WidgetHandle, WidgetProps & { values: number[]; steps: Step[] }>(
  function BubbleSort({ values, steps, step, animate }, ref) {
    const { frames, passEnd } = useMemo(() => trace(values), [values]);
    const target = (s: number) => {
      const p = Math.min(Math.max(steps[s]?.pass ?? s, 0), passEnd.length - 1);
      return passEnd[p];
    };
    const [fi, setFi] = useState(() => target(step));
    const goal = useRef(fi);
    const timer = useRef<number | undefined>(undefined);

    const stop = () => { window.clearInterval(timer.current); timer.current = undefined; };

    useEffect(() => {
      const t = target(step);
      goal.current = t;
      stop();
      if (!animate || t <= fi) { setFi(t); return; }
      timer.current = window.setInterval(() => {
        setFi((cur) => {
          const next = cur + 1;
          if (next >= goal.current) stop();
          return Math.min(next, goal.current);
        });
      }, TICK);
      return stop;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, animate, frames]);

    useImperativeHandle(ref, () => ({
      busy: () => timer.current !== undefined,
      finish: () => { stop(); setFi(goal.current); },
    }));

    const f = frames[fi];
    const max = Math.max(...values);
    const n = values.length;
    const pos = new Map(f.arr.map((it, i) => [it.id, i]));
    const note = f.at < 0
      ? (f.sortedFrom === 0 ? '排好了' : '還沒開始')
      : `${f.arr[f.swapped ? f.at + 1 : f.at].v} 和 ${f.arr[f.swapped ? f.at : f.at + 1].v}：${f.swapped ? '左邊比較大，交換' : '順序對，不動'}`;
    const hl = f.at < 0 ? [] : f.swapped ? ['4', '5'] : ['4'];

    return (
      <div className="bs">
        <div className="bs-viz">
          <div className="bs-chart">
            {values.map((_, id) => {
              const i = pos.get(id)!;
              const it = f.arr[i];
              const state = i >= f.sortedFrom ? 'd' : i === f.at || i === f.at + 1 ? 'h' : '';
              return (
                <div key={id} className={`bs-bar ${state}`} style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}>
                  <i style={{ height: `${(it.v / max) * 92}%` }} />
                  <span className="tnum">{it.v}</span>
                </div>
              );
            })}
          </div>
          <div className="meta bs-meta">
            <div>這一步<strong>{note}</strong></div>
            <div>比較<strong>{f.comps}</strong></div>
            <div>交換<strong>{f.swaps}</strong></div>
          </div>
          <div className="player">
            <input
              type="range" min={0} max={frames.length - 1} value={fi} aria-label="拖動看每一次比較"
              onChange={(e) => { stop(); setFi(+e.target.value); }}
              style={{ ['--p' as string]: `${(fi / (frames.length - 1)) * 100}%` }}
            />
            <span className="tnum">{fi} / {frames.length - 1}</span>
          </div>
        </div>
        <div className="code">
          <div className="ctabs"><span className="ct on">bubble.py</span></div>
          <div className="src">
            {CODE.map(([no, line]) => {
              const text = line.replace('{V}', values.join(', '));
              return (
                <div key={no} className={`ln${hl.includes(no) ? ' hl' : ''}`}>
                  <b>{no}</b>
                  {text.split(KW).map((part, k) => (isKw(part) ? <span key={k} className="kw">{part}</span> : part))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);
