import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
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
  end: number;
}

function trace(values: number[]) {
  const n = values.length;
  let arr = values.map((v, id) => ({ id, v }));
  let comps = 0, swaps = 0;
  const frames: Frame[] = [{ arr, at: -1, swapped: false, sortedFrom: n, comps, swaps, end: n - 1 }];
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
      frames.push({ arr, at: j, swapped, sortedFrom: j === end - 1 ? end : n - p, comps, swaps, end });
    }
    passEnd.push(frames.length - 1);
  }
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

const SPEEDS = [0.5, 1, 2] as const;
const BASE_TICK = 520;

function randomList(len: number): number[] {
  const pool = Array.from({ length: Math.max(len + 3, 9) }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out = pool.slice(0, len);
  // ensure it's not already sorted so sorting is interesting
  if (out.every((v, i) => i === 0 || out[i - 1] <= v)) out.reverse();
  return out;
}

export const BubbleSort = forwardRef<WidgetHandle, WidgetProps & { values: number[]; steps: Step[] }>(
  function BubbleSort({ values, steps, step, animate, onDirtyChange }, ref) {
    const [activeValues, setActiveValues] = useState<number[]>(values);
    const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
    const [playing, setPlaying] = useState(false);

    // Sync when chapter's values prop changes
    useEffect(() => {
      setActiveValues(values);
    }, [values]);

    const { frames, passEnd } = useMemo(() => trace(activeValues), [activeValues]);
    const target = useCallback((s: number) => {
      const p = Math.min(Math.max(steps[s]?.pass ?? s, 0), passEnd.length - 1);
      return passEnd[p];
    }, [steps, passEnd]);

    const [fi, setFi] = useState(() => target(step));
    const goal = useRef(fi);
    const timer = useRef<number | undefined>(undefined);
    const customArr = activeValues !== values;

    const stop = useCallback(() => {
      window.clearInterval(timer.current);
      timer.current = undefined;
      setPlaying(false);
    }, []);

    const playTo = useCallback((toFrame: number, startFrame?: number) => {
      stop();
      goal.current = toFrame;
      if (startFrame !== undefined) setFi(startFrame);
      setPlaying(true);
      timer.current = window.setInterval(() => {
        setFi((cur) => {
          const next = cur + 1;
          if (next >= goal.current) {
            window.clearInterval(timer.current);
            timer.current = undefined;
            setPlaying(false);
          }
          return Math.min(next, goal.current);
        });
      }, Math.round(BASE_TICK / speed));
    }, [speed, stop]);

    useEffect(() => {
      const t = target(step);
      goal.current = t;
      stop();
      if (!animate || t <= fi) { setFi(t); return; }
      playTo(t);
      return stop;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, animate, frames]);

    // Update interval rate seamlessly if speed changes mid-play
    useEffect(() => {
      if (!playing) return;
      playTo(goal.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speed]);

    useEffect(() => {
      const dirty = customArr || fi !== target(step);
      onDirtyChange?.(dirty);
    }, [customArr, fi, step, target, onDirtyChange]);

    useImperativeHandle(ref, () => ({
      busy: () => timer.current !== undefined,
      finish: () => { stop(); setFi(goal.current); },
      replay: () => {
        const t = target(step);
        const prevT = step > 0 ? target(step - 1) : 0;
        const from = prevT < t ? prevT : 0;
        if (t > from) playTo(t, from);
        else playTo(frames.length - 1, 0);
      },
      reset: () => {
        stop();
        setActiveValues(values);
        const t = target(step);
        goal.current = t;
        setFi(t);
      },
    }), [frames.length, playTo, step, stop, target, values]);

    const togglePlay = () => {
      if (playing) { stop(); return; }
      const end = frames.length - 1;
      if (fi >= end) playTo(end, 0);
      else playTo(end);
    };

    const stepBy = (delta: number) => {
      stop();
      setFi((cur) => Math.max(0, Math.min(frames.length - 1, cur + delta)));
    };

    const cycleSpeed = () => {
      setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length]);
    };

    const shuffle = () => {
      stop();
      setActiveValues(randomList(values.length));
      setFi(0);
    };

    const f = frames[Math.min(fi, frames.length - 1)];
    const max = Math.max(...activeValues, 1);
    const n = activeValues.length;
    const pos = new Map(f.arr.map((it, i) => [it.id, i]));
    const note = f.at < 0
      ? (f.sortedFrom === 0 ? '全部排好了' : '還沒開始')
      : `${f.arr[f.swapped ? f.at + 1 : f.at].v} 和 ${f.arr[f.swapped ? f.at : f.at + 1].v}：${f.swapped ? '左邊比較大，交換' : '順序對，不動'}`;
    const hl = f.at < 0 ? [] : f.swapped ? ['4', '5'] : ['4'];
    const progressPct = frames.length > 1 ? (fi / (frames.length - 1)) * 100 : 100;

    return (
      <div className="bs">
        <div className="bs-viz">
          <div className="bs-chart">
            {f.at >= 0 && (
              <div
                className={`bs-pair${f.swapped ? ' swapped' : ''}`}
                style={{ left: `${(f.at / n) * 100}%`, width: `${(2 / n) * 100}%` }}
                aria-hidden="true"
              >
                <span>{f.swapped ? '交換' : '比較'}</span>
              </div>
            )}
            {activeValues.map((_, id) => {
              const i = pos.get(id)!;
              const it = f.arr[i];
              const comparing = i === f.at || i === f.at + 1;
              const state = i >= f.sortedFrom ? 'd' : comparing ? (f.swapped ? 'h swap' : 'h') : '';
              return (
                <div key={id} className={`bs-bar ${state}`} style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}>
                  <i style={{ height: `${(it.v / max) * 86}%` }} />
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
            <button type="button" className="pbtn" onClick={togglePlay} aria-label={playing ? '暫停' : '播放'} title={playing ? '暫停' : '播放'}>
              {playing ? <Icon.pause /> : <Icon.play />}
            </button>
            <button type="button" className="pbtn" onClick={() => stepBy(-1)} disabled={fi === 0} aria-label="上一次比較" title="上一次比較">
              <Icon.left />
            </button>
            <button type="button" className="pbtn" onClick={() => stepBy(1)} disabled={fi >= frames.length - 1} aria-label="下一次比較" title="下一次比較">
              <Icon.right />
            </button>
            <input
              type="range" min={0} max={Math.max(1, frames.length - 1)} value={fi} aria-label="拖動看每一次比較"
              onChange={(e) => { stop(); setFi(+e.target.value); }}
              style={{ ['--p' as string]: `${progressPct}%` }}
            />
            <span className="tnum pcnt">{fi} / {frames.length - 1}</span>
            <button type="button" className="pspd tnum" onClick={cycleSpeed} title="切換播放速度">{speed}×</button>
            <button type="button" className="pbtn" onClick={shuffle} aria-label="隨機一組數字" title="隨機一組數字">
              <Icon.shuffle />
            </button>
          </div>
        </div>
        <div className="code">
          <div className="ctabs">
            <span className="ct on">bubble.py</span>
            {f.at >= 0 && (
              <span className="cvars mono tnum">
                <span>end = {f.end}</span>
                <span>j = {f.at}</span>
              </span>
            )}
          </div>
          <div className="src">
            {CODE.map(([no, line]) => {
              const text = line.replace('{V}', activeValues.join(', '));
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
