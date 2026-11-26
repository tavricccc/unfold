import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { Composer } from '../components/Composer';
import { Icon, rich } from '../icons';
import { chaptersOf, itemsOf, lastSuggestions, type Chapter } from '../chapters';
import type { Cost, Draft, LessonRecord, Step, Widget } from '../lesson';
import { EFFORT_LABEL, MODEL_LABEL, type Gen } from '../settings';
import { BubbleSort } from '../widgets/BubbleSort';
import { HtmlWidget } from '../widgets/HtmlWidget';
import { PlotWidget } from '../widgets/Plot';
import type { WidgetHandle } from '../widgets/types';

/**
 * A lesson reads as one narration beside its visual: the paragraph being read is bright, the ones
 * before it fade, the next one shows faintly. A follow-up's answer lands where Claude chose: a new
 * chapter, more steps in the chapter being read, or a text reply in it. Chapters other than the
 * current one fold into a row; the chapter menu and the progress ticks jump anywhere.
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
  const narr = useRef<HTMLDivElement>(null);
  /** the part a follow-up will be written as; the view moves to its first item when it arrives */
  const jump = useRef<number | null>(null);

  const load = useCallback(() => {
    api.getLesson(id).then((r) => {
      setRec(r);
      const j = jump.current;
      const landed = j == null || r.pending ? undefined : itemsOf(chaptersOf(r)).find((it) => it.part === j);
      if (landed) {
        jump.current = null;
        setStep(landed.i); setAnimate(true);
        api.setProgress(id, landed.i).then(onProgress, (e) => console.error('save progress failed', e));
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

  const chs = rec ? chaptersOf(rec) : [];
  const flat = itemsOf(chs);
  const total = flat.length;

  const go = useCallback((n: number, anim: boolean) => {
    if (n < 0 || n >= total) return;
    setAnimate(anim);
    setStep(n);
    api.setProgress(id, n).then(onProgress, (e) => console.error('save progress failed', e));
  }, [id, total, onProgress]);

  const parts = 1 + (rec?.more?.length ?? 0);
  const follow = useCallback((q: string, chapter: number) => {
    jump.current = parts;
    setStatus('正在讀你的追問…');
    api.continueLesson(id, q, gen, chapter).then(load, (e) => { jump.current = null; setStatus(`沒辦法追問：${e}`); load(); });
  }, [id, gen, parts, load]);

  const next = useCallback(() => {
    if (widget.current?.busy()) widget.current.finish();
    else go(step + 1, true);
  }, [go, step]);
  const prev = useCallback(() => go(step - 1, false), [go, step]);
  const cur = flat[Math.min(step, total - 1)];
  const toChapter = useCallback((c: number) => {
    const first = chs[c]?.items[0];
    if (first) go(first.i, false);
  }, [chs, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('textarea, input, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (cur && e.key === 'PageDown') { e.preventDefault(); toChapter(cur.chapter + 1); }
      else if (cur && e.key === 'PageUp') { e.preventDefault(); toChapter(chs[cur.chapter].items[0].i < cur.i ? cur.chapter : cur.chapter - 1); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [next, prev, toChapter, cur, chs]);

  // The narration moves by scrolling: the wheel steps through it, and whatever brings a new
  // paragraph in (the wheel, 繼續, a key, a click) glides it to the middle of the column.
  const wheel = useRef({ acc: 0, until: 0 });
  useEffect(() => {
    const el = narr.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      const w = wheel.current, now = performance.now();
      if (now < w.until) return;
      w.acc += e.deltaY;
      if (Math.abs(w.acc) < 40) return;
      const down = w.acc > 0;
      w.acc = 0; w.until = now + 420;
      if (down) next(); else prev();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [next, prev, rec?.status]);

  useEffect(() => {
    const box = narr.current;
    const at = box?.querySelector<HTMLElement>('.chap-pending .skel, .chap-pending .perr') ?? box?.querySelector<HTMLElement>('.para.now');
    at?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [step, rec]);

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
          <div className="narr" ref={narr}><div className="narr-in">
            <Ask question={rec.question} />
            {d?.title && <h2 className="chap-t">{d.title}</h2>}
            {!failed && <Drafting draft={d} />}
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
  const ch = chs[cur.chapter];
  const pend = rec.pending;
  const writing = pend?.status === 'generating';
  const pendAt = Math.min(pend?.at ?? chs.length - 1, chs.length - 1);
  const atEnd = ch.items[ch.items.length - 1].i <= step + 1;
  const after = flat[step + 1];
  const rename = (name: string) => api.renameChapter(id, cur.chapter, name).then(load, (e) => setStatus(`沒辦法改名：${e}`));

  return (
    <main className="panel">
      <header className="bar">
        <div className="crumb">
          {L.crumbs.filter((c) => c !== short).map((c) => <Fragment key={c}>{c}<Icon.chevron /></Fragment>)}
          <b>{short}</b>
        </div>
        {chs.length > 1 && <ChapterMenu chs={chs} step={step} current={cur.chapter} onPick={toChapter} />}
        <span className="sp" />
        <Ticks chs={chs} step={step} go={(n) => go(n, n === step + 1)} />
        <span className="count tnum">{step + 1} / {total}</span>
        <button className="ib" onClick={prev} disabled={step === 0} aria-label="上一步" title="上一步（←）"><Icon.left /></button>
        {after
          ? <button className="go" onClick={next} title="繼續（→）">{after.chapter !== cur.chapter ? '下一章' : '繼續'}<Icon.right /></button>
          : writing ? <span className="fin wait">正在回答</span>
          : <span className="fin"><Icon.check />學完了</span>}
      </header>
      <div className="body">
        <div className="narr" ref={narr}><div className="narr-in">
          {chs.slice(0, cur.chapter).map((c, n) => <Folded key={n} n={n} ch={c} onClick={() => toChapter(n)} />)}
          <Ask question={ch.question} />
          <Title key={cur.chapter} ch={ch} onRename={rename} />
          {ch.items.map((it) => it.i <= step + 1 && (
            <Fragment key={it.i}>
              {it.asked && it.part > 0 && it.i !== ch.items[0].i && <Ask question={it.asked} />}
              <p
                className={`para ${it.kind === 'text' ? 'reply ' : ''}${it.i < step ? 'past' : it.i === step ? 'now' : 'next'}`}
                onClick={() => it.i !== step && go(it.i, it.i === step + 1)}
              >{rich(it.text)}</p>
            </Fragment>
          ))}
          {pend && pendAt === cur.chapter && atEnd && (
            <div className="chap-pending">
              <Ask question={pend.question} />
              {pend.draft?.mode === 'chapter' && pend.draft.title && <h2 className="chap-t">{pend.draft.title}</h2>}
              {writing
                ? <Drafting draft={pend.draft} />
                : <div className="perr"><span>{pend.error}</span><button className="btn" onClick={() => follow(pend.question, pendAt)}><Icon.retry />再試一次</button></div>}
            </div>
          )}
          {chs.slice(cur.chapter + 1).map((c, n) => <Folded key={n} n={cur.chapter + 1 + n} ch={c} onClick={() => toChapter(cur.chapter + 1 + n)} />)}
        </div></div>
        <div className="stage">
          <p className="task">{ch.tasks[cur.version]}</p>
          <div className="wbox"><WidgetFor key={`${cur.chapter}-${cur.version}`} widget={ch.versions[cur.version]} steps={ch.steps} step={cur.local} animate={animate} handle={widget} /></div>
        </div>
      </div>
      <Composer
        busy={writing} status={status} suggestions={lastSuggestions(rec)}
        onSubmit={(q) => follow(q, cur.chapter)} placeholder={chs.length > 1 ? `追問第 ${cur.chapter + 1} 章…` : '追問這一課…'} onStop={stop} foot={foot}
      />
    </main>
  );
}

function Ask({ question }: { question: string }) {
  return <p className="asked">{question}</p>;
}

function Drafting({ draft }: { draft?: Draft }) {
  return (
    <>
      {draft?.text && <p className="para reply past">{rich(draft.text)}</p>}
      {draft?.steps?.map((st, k) => <p key={k} className="para past">{rich(st.text)}</p>)}
      <div className="skel"><i /><i style={{ width: '70%' }} /></div>
    </>
  );
}

/** The chapter title; the learner can rename it (Claude's title comes back when the name is cleared). */
function Title({ ch, onRename }: { ch: Chapter; onRename: (name: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(ch.title);
  const save = () => { setEdit(false); if (val.trim() !== ch.title) onRename(val.trim() === ch.written ? '' : val); };
  if (edit) {
    return (
      <input
        className="chap-t chap-in" value={val} autoFocus placeholder={ch.written} aria-label="章節名稱"
        onChange={(e) => setVal(e.target.value)} onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) save();
          if (e.key === 'Escape') { setVal(ch.title); setEdit(false); }
        }}
      />
    );
  }
  return (
    <h2 className="chap-t" onDoubleClick={() => { setVal(ch.title); setEdit(true); }}>
      {ch.title}
      <button className="ren" onClick={() => { setVal(ch.title); setEdit(true); }} aria-label="重新命名這一章" title="重新命名"><Icon.pencil /></button>
    </h2>
  );
}

/** A chapter that is not being read: one row that jumps to it. */
function Folded({ n, ch, onClick }: { n: number; ch: Chapter; onClick: () => void }) {
  return (
    <button className="folded" onClick={onClick}>
      <span className="no tnum">{n + 1}</span>
      <span className="ft">{ch.title}</span>
      <span className="fs tnum">{ch.items.length} 段</span>
    </button>
  );
}

/** The chapter switcher in the top bar. */
function ChapterMenu({ chs, step, current, onPick }: {
  chs: Chapter[]; step: number; current: number; onPick: (c: number) => void;
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
        <span className="tnum">第 {current + 1} / {chs.length} 章</span><Icon.down />
      </button>
      {open && (
        <div className="menu" role="menu">
          {chs.map((c, n) => (
            <button key={n} role="menuitem" className={`mi${n === current ? ' on' : ''}`} onClick={() => { onPick(n); setOpen(false); }}>
              <span className="no tnum">{n + 1}</span>
              <span className="mt"><b>{c.title}</b><span>{c.question}</span></span>
              <span className="ms tnum">{c.items.filter((it) => it.i <= step).length} / {c.items.length}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Progress ticks, grouped by chapter; each one jumps to its item. */
function Ticks({ chs, step, go }: { chs: Chapter[]; step: number; go: (n: number) => void }) {
  return (
    <div className="prog">
      {chs.map((c, n) => (
        <span key={n} className="pg">
          {c.items.map((it) => (
            <button key={it.i} className={`${it.i < step ? 'd' : it.i === step ? 'n' : ''}${it.kind === 'text' ? ' t' : ''}`} onClick={() => go(it.i)} aria-label={`第 ${it.i + 1} 段`} title={`第 ${it.i + 1} 段`} />
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
      <span className="chip"><i />{MODEL_LABEL[gen.model]}{` · ${EFFORT_LABEL[gen.effort]}`}</span>
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

function WidgetFor({ widget: w, steps, step, animate, handle }: {
  widget: Widget; steps: Step[]; step: number; animate: boolean; handle: React.RefObject<WidgetHandle | null>;
}) {
  if (w.kind === 'bubble-sort' && w.values?.length) return <BubbleSort ref={handle} values={w.values} steps={steps} step={step} animate={animate} />;
  if (w.kind === 'plot' && w.plot) return <PlotWidget ref={handle} spec={w.plot} steps={steps} step={step} animate={animate} />;
  if (w.kind === 'html' && w.html) return <HtmlWidget ref={handle} html={w.html} step={step} animate={animate} />;
  return <div className="empty">這一課的元件格式不對，沒辦法顯示。</div>;
}
