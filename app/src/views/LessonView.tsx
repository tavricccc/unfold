import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Composer } from '../components/Composer';
import { Icon, rich } from '../icons';
import type { Cost, Lesson, LessonRecord, Part } from '../lesson';
import { EFFORT_LABEL, MODEL_LABEL, type Gen } from '../settings';
import { BubbleSort } from '../widgets/BubbleSort';
import { HtmlWidget } from '../widgets/HtmlWidget';
import { PlotWidget } from '../widgets/Plot';
import type { WidgetHandle } from '../widgets/types';

/**
 * A lesson reads as one narration beside its visual: the paragraph being read is bright, the ones
 * before it fade, the next one shows faintly. Each follow-up is a chapter; chapters other than the
 * current one fold into a row, and the chapter menu and the progress ticks jump anywhere.
 */
export function LessonView({ id, gen, onAsk, onProgress }: {
  id: string; gen: Gen; onAsk: (q: string) => void; onProgress: () => void;
}) {
  const [rec, setRec] = useState<LessonRecord | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('正在讀你的問題…');
  const [step, setStep] = useState(0);
  const [animate, setAnimate] = useState(false);
  const widget = useRef<WidgetHandle>(null);
  /** first step of a follow-up being written; the view moves there when it arrives */
  const jump = useRef<number | null>(null);

  const load = useCallback(() => {
    api.getLesson(id).then((r) => {
      setRec(r);
      const j = jump.current;
      if (j != null && !r.pending && flatten(r).length > j) {
        jump.current = null;
        setStep(j); setAnimate(true);
        api.setProgress(id, j).then(onProgress, (e) => console.error('save progress failed', e));
      } else {
        if (r.pending?.status !== 'generating') jump.current = null;
        setStep(r.step); setAnimate(false);
      }
    }, (e) => setLoadError(String(e)));
  }, [id, onProgress]);

  useEffect(() => {
    load();
    return api.onLessonEvent((e) => {
      if (e.id !== id) return;
      if (e.type === 'status') setStatus(e.text);
      else if (e.type === 'partial') setRec((r) => {
        if (r && e.more && r.pending) return { ...r, pending: { ...r.pending, draft: e.lesson } };
        return r && !e.more && r.status === 'generating' ? { ...r, draft: e.lesson } : r;
      });
      else load();
    });
  }, [id, load]);

  const flat = rec ? flatten(rec) : [];
  const total = flat.length;
  const parts = rec ? partsOf(rec) : [];

  const go = useCallback((n: number, anim: boolean) => {
    if (n < 0 || n >= total) return;
    setAnimate(anim);
    setStep(n);
    api.setProgress(id, n).then(onProgress, (e) => console.error('save progress failed', e));
  }, [id, total, onProgress]);

  const follow = useCallback((q: string) => {
    jump.current = total;
    setStatus('正在讀你的追問…');
    api.continueLesson(id, q, gen).then(load, (e) => { jump.current = null; setStatus(`沒辦法追問：${e}`); load(); });
  }, [id, gen, total, load]);

  const next = useCallback(() => {
    if (widget.current?.busy()) widget.current.finish();
    else go(step + 1, true);
  }, [go, step]);
  const prev = useCallback(() => go(step - 1, false), [go, step]);
  const cur = flat[Math.min(step, total - 1)];
  const toChapter = useCallback((p: number) => {
    const first = flat.findIndex((f) => f.part === p);
    if (first >= 0) go(first, false);
  }, [flat, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('textarea, input, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (cur && e.key === 'PageDown') { e.preventDefault(); toChapter(cur.part + 1); }
      else if (cur && e.key === 'PageUp') { e.preventDefault(); toChapter(cur.local > 0 ? cur.part : cur.part - 1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [next, prev, toChapter, cur]);

  if (loadError) return <main className="panel plain"><header className="bar" /><div className="empty">讀不到這一課：{loadError}</div></main>;
  if (!rec) return <main className="panel plain"><header className="bar" /></main>;

  const stop = () => api.cancelLesson(id).catch((e) => setStatus(`停不下來：${e}`));
  const foot = <GenFoot gen={gen} cost={costOf(rec)} />;

  // Still writing the lesson itself, or it failed.
  if (rec.status !== 'ready' || !rec.lesson) {
    const failed = rec.status === 'error';
    const d = rec.draft;
    return (
      <main className="panel">
        <header className="bar">
          <div className="crumb">
            {d?.crumbs?.map((c) => <Fragment key={c}>{c}<Icon.chevron /></Fragment>)}
            <b>{failed ? '沒有生成成功' : '正在準備這一課'}</b>
          </div>
        </header>
        <div className="body">
          <div className="narr"><div className="narr-in">
            <Ask question={rec.question} />
            {d?.title && <h2 className="chap-t">{d.title}</h2>}
            {!failed && <Drafting steps={d?.steps} />}
          </div></div>
          <div className="stage">
            {failed ? (
              <div className="empty">
                <p>{rec.error}</p>
                <button className="btn" onClick={() => onAsk(rec.question)}><Icon.retry />再試一次</button>
              </div>
            ) : <div className="stage-wait"><span className="dots"><i /><i /><i /></span><span>{status}</span></div>}
          </div>
        </div>
        <Composer busy={!failed} status={status} onSubmit={(q) => onAsk(q)} placeholder="問一個新問題…" onStop={stop} foot={foot} />
      </main>
    );
  }

  const L = rec.lesson;
  const short = L.title.split(/[：:]/)[0];
  const part = parts[cur.part];
  const pend = rec.pending;
  const writing = pend?.status === 'generating';
  const lastPart = cur.part === parts.length - 1;
  const chapterSteps = flat.filter((f) => f.part === cur.part);

  return (
    <main className="panel">
      <header className="bar">
        <div className="crumb">
          {L.crumbs.filter((c) => c !== short).map((c) => <Fragment key={c}>{c}<Icon.chevron /></Fragment>)}
          <b>{short}</b>
        </div>
        {parts.length > 1 && <ChapterMenu parts={parts} flat={flat} step={step} current={cur.part} onPick={toChapter} />}
        <span className="sp" />
        <Ticks flat={flat} step={step} go={(n) => go(n, n === step + 1)} />
        <span className="count tnum">{step + 1} / {total}</span>
        <button className="ib" onClick={prev} disabled={step === 0} aria-label="上一步" title="上一步（←）"><Icon.left /></button>
        {step < total - 1
          ? <button className="primary" onClick={next}>{cur.part !== flat[step + 1].part ? '下一章' : '繼續'} <kbd>→</kbd></button>
          : writing ? <span className="fin wait">正在接著寫</span>
          : <span className="fin"><Icon.check />學完了</span>}
      </header>
      <div className="body">
        <div className="narr"><div className="narr-in">
          {parts.slice(0, cur.part).map((p, i) => <Folded key={i} n={i} part={p} onClick={() => toChapter(i)} />)}
          <Ask question={part.question} />
          <h2 className="chap-t">{part.lesson.title}</h2>
          {chapterSteps.map((f) => f.local <= cur.local + 1 && (
            <p
              key={f.i}
              ref={f.i === step ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) : undefined}
              className={`para ${f.i < step ? 'past' : f.i === step ? 'now' : 'next'}`}
              onClick={() => f.i !== step && go(f.i, f.i === step + 1)}
            >{rich(f.text)}</p>
          ))}
          {parts.slice(cur.part + 1).map((p, i) => <Folded key={i} n={cur.part + 1 + i} part={p} onClick={() => toChapter(cur.part + 1 + i)} />)}
          {pend && lastPart && step >= total - 2 && (
            <div className="chap-pending">
              <Ask question={pend.question} />
              {pend.draft?.title && <h2 className="chap-t">{pend.draft.title}</h2>}
              {writing
                ? <Drafting steps={pend.draft?.steps} />
                : <div className="perr"><span>{pend.error}</span><button className="btn" onClick={() => follow(pend.question)}><Icon.retry />再試一次</button></div>}
            </div>
          )}
        </div></div>
        <div className="stage">
          <p className="task">{part.lesson.task}</p>
          <div className="wbox"><WidgetFor key={cur.part} lesson={part.lesson} step={cur.local} animate={animate} widget={widget} /></div>
        </div>
      </div>
      <Composer
        busy={writing} status={status} suggestions={parts[parts.length - 1].lesson.suggestions}
        onSubmit={follow} placeholder="追問這一課…" onStop={stop} foot={foot}
      />
    </main>
  );
}

function Ask({ question }: { question: string }) {
  return <p className="asked">{question}</p>;
}

function Drafting({ steps }: { steps?: { text: string }[] }) {
  return (
    <>
      {steps?.map((st, k) => <p key={k} className="para past">{rich(st.text)}</p>)}
      <div className="skel"><i /><i style={{ width: '70%' }} /></div>
    </>
  );
}

/** A chapter that is not being read: one row that jumps to it. */
function Folded({ n, part, onClick }: { n: number; part: Part; onClick: () => void }) {
  return (
    <button className="folded" onClick={onClick}>
      <span className="no tnum">{n + 1}</span>
      <span className="ft">{part.lesson.title}</span>
      <span className="fs tnum">{part.lesson.steps.length} 步</span>
    </button>
  );
}

/** The chapter switcher in the top bar. */
function ChapterMenu({ parts, flat, step, current, onPick }: {
  parts: Part[]; flat: Flat[]; step: number; current: number; onPick: (p: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', away);
    addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="chapters" ref={box}>
      <button className={`chap-btn${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <span className="tnum">第 {current + 1} / {parts.length} 章</span><Icon.down />
      </button>
      {open && (
        <div className="menu" role="menu">
          {parts.map((p, i) => {
            const mine = flat.filter((f) => f.part === i);
            const read = mine.filter((f) => f.i <= step).length;
            return (
              <button key={i} role="menuitem" className={`mi${i === current ? ' on' : ''}`} onClick={() => { onPick(i); setOpen(false); }}>
                <span className="no tnum">{i + 1}</span>
                <span className="mt"><b>{p.lesson.title}</b><span>{p.question}</span></span>
                <span className="ms tnum">{read} / {mine.length}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Progress ticks, grouped by chapter; each one jumps to its step. */
function Ticks({ flat, step, go }: { flat: Flat[]; step: number; go: (n: number) => void }) {
  const groups: Flat[][] = [];
  for (const f of flat) (groups[f.part] ??= []).push(f);
  return (
    <div className="prog">
      {groups.map((g, p) => (
        <span key={p} className="pg">
          {g.map((f) => (
            <button key={f.i} className={f.i < step ? 'd' : f.i === step ? 'n' : ''} onClick={() => go(f.i)} aria-label={`第 ${f.i + 1} 步`} title={`第 ${f.i + 1} 步`} />
          ))}
        </span>
      ))}
    </div>
  );
}

/** Model on the left, what this lesson has cost so far on the right. */
function GenFoot({ gen, cost }: { gen: Gen; cost?: Cost }) {
  return (
    <>
      <span className="chip"><i />{MODEL_LABEL[gen.model]}{gen.effort && ` · ${EFFORT_LABEL[gen.effort]}`}</span>
      {cost && <CostTag cost={cost} />}
    </>
  );
}

export function CostTag({ cost }: { cost: Cost }): ReactNode {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const tip = `輸入 ${k(cost.input)} · 輸出 ${k(cost.output)} · 快取讀取 ${k(cost.cacheRead)} · 快取寫入 ${k(cost.cacheWrite)}`;
  return <span className="cost tnum" title={tip}>本課 {usd(cost.usd)}</span>;
}

const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;

/** The lesson's cost plus every follow-up's, or nothing when none was recorded. */
function costOf(r: LessonRecord): Cost | undefined {
  const all = [r.cost, ...(r.more ?? []).map((p) => p.cost)].filter((c): c is Cost => !!c);
  if (!all.length) return undefined;
  return all.reduce((a, c) => ({
    usd: a.usd + c.usd, input: a.input + c.input, output: a.output + c.output,
    cacheRead: a.cacheRead + c.cacheRead, cacheWrite: a.cacheWrite + c.cacheWrite,
  }));
}

/** The lesson followed by each follow-up answered inside it. */
function partsOf(r: LessonRecord): Part[] {
  return r.lesson ? [{ question: r.question, lesson: r.lesson }, ...(r.more ?? [])] : [];
}

type Flat = { text: string; part: number; local: number; i: number };

/** Every step of the lesson in order, with its chapter and its index inside that chapter. */
function flatten(r: LessonRecord): Flat[] {
  let i = 0;
  return partsOf(r).flatMap((p, part) => p.lesson.steps.map((st, local) => ({ text: st.text, part, local, i: i++ })));
}

function WidgetFor({ lesson, step, animate, widget }: {
  lesson: Lesson; step: number; animate: boolean; widget: React.RefObject<WidgetHandle | null>;
}) {
  const w = lesson.widget;
  if (w.kind === 'bubble-sort' && w.values?.length) return <BubbleSort ref={widget} values={w.values} steps={lesson.steps} step={step} animate={animate} />;
  if (w.kind === 'plot' && w.plot) return <PlotWidget ref={widget} spec={w.plot} steps={lesson.steps} step={step} animate={animate} />;
  if (w.kind === 'html' && w.html) return <HtmlWidget ref={widget} html={w.html} step={step} animate={animate} />;
  return <div className="empty">這一課的元件格式不對，沒辦法顯示。</div>;
}
