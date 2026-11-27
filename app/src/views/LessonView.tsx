import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { api } from '../api';
import { Composer } from '../components/Composer';
import { GenPicker } from '../components/GenPicker';
import { Icon, rich } from '../icons';
import { chaptersOf, courseWritten, itemsOf, lastSuggestions, type Chapter, type Item } from '../chapters';
import { KIT_KINDS, type Answer, type Ask as Questions, type Cost, type Course, type Draft, type KitKind, type LessonRecord, type Step, type Widget } from '../lesson';
import { kitBody } from '../kit/doc';
import { DEFAULT_NARR_WIDTH, EFFORT_LABEL, MAX_NARR_WIDTH, MIN_NARR_WIDTH, MODEL_LABEL, type Gen, type Settings } from '../settings';
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
export function LessonView({ id, gen, settings, update, onAsk, onProgress, onDelete, onHome }: {
  id: string;
  gen: Gen;
  settings?: Settings;
  update?: (p: Partial<Settings>) => void;
  onAsk: (q: string) => void;
  onProgress: () => void;
  onDelete?: (id: string) => void;
  onHome?: () => void;
}) {
  const [rec, setRec] = useState<LessonRecord | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('正在讀你的問題…');
  const [step, setStep] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [stageDirty, setStageDirty] = useState(false);
  const [stageExpanded, setStageExpanded] = useState(false);
  const [draggingSplit, setDraggingSplit] = useState(false);
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

  const replay = useCallback(() => {
    widget.current?.replay?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('textarea, input, select, [contenteditable], [role="dialog"]')) return;
      if (e.key === 'Escape' && stageExpanded) { e.preventDefault(); setStageExpanded(false); return; }
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === ' ' && !t.closest('button, a')) { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (cur && e.key === 'PageDown') { e.preventDefault(); toChapter(cur.chapter + 1); }
      else if (cur && e.key === 'PageUp') { e.preventDefault(); toChapter(chs[cur.chapter].items[0].i < cur.i ? cur.chapter : cur.chapter - 1); }
      else if (rec?.status === 'ready' && e.key.toLowerCase() === 'r') { e.preventDefault(); replay(); }
      else if (rec?.status === 'ready' && e.key.toLowerCase() === 'f') { e.preventDefault(); setStageExpanded((v) => !v); }
      else if (chs.length > 1 && e.key >= '1' && e.key <= '9') {
        const idx = Number(e.key) - 1;
        if (idx < chs.length) { e.preventDefault(); toChapter(idx); }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [next, prev, toChapter, replay, cur, chs, rec?.status, stageExpanded]);

  // The narration moves by scrolling: the wheel steps through it, and whatever brings a new
  // paragraph in (the wheel, 繼續, a key, a click) glides it to the bottom of the column.
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
      w.acc = 0; w.until = now + 380;
      if (down) next(); else prev();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [next, prev, rec?.status]);

  // Nothing past the next paragraph is rendered, so the newest text is always at the end: keep the
  // column pinned to its bottom.
  useEffect(() => {
    const box = narr.current;
    box?.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
  }, [step, rec]);

  // Reset dirty state when switching chapter/version
  const widgetKey = cur ? `${cur.chapter}-${cur.version}` : '';
  useEffect(() => { setStageDirty(false); }, [widgetKey]);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = settings?.narrWidth ?? (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--col'), 10) || DEFAULT_NARR_WIDTH);
    let latest = startW;
    setDraggingSplit(true);
    const onMove = (ev: PointerEvent) => {
      latest = Math.max(MIN_NARR_WIDTH, Math.min(MAX_NARR_WIDTH, Math.round(startW + (ev.clientX - startX))));
      document.documentElement.style.setProperty('--col', `${latest}px`);
    };
    const onUp = () => {
      setDraggingSplit(false);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      update?.({ narrWidth: latest });
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
  };

  if (loadError) return <main className="panel plain view-in"><header className="bar" /><div className="empty">讀不到這一課：{loadError}</div></main>;
  if (!rec) return <main className="panel plain"><header className="bar" /></main>;

  const stop = () => api.cancelLesson(id).catch((e) => setStatus(`停不下來：${e}`));
  const foot = <GenFoot gen={gen} settings={settings} update={update} cost={costOf(rec)} />;
  const resumeCourse = () => { setStatus('正在接著寫…'); api.continueCourse(id, gen).then(load, (e) => setStatus(`沒辦法接著寫：${e}`)); };

  // Claude asked before teaching: the learner answers (or skips) here.
  if (rec.status === 'asking' && rec.ask) {
    const send = (answers: Answer[]) => {
      setStatus(answers.length ? '正在讀你的回答…' : '正在想怎麼教…');
      api.answerLesson(id, answers, gen).then(load, (e) => setStatus(`沒辦法開始：${e}`));
    };
    return (
      <main className="panel view-in">
        <header className="bar"><div className="crumb"><b>開始之前</b></div></header>
        <div className="qbody">
          <QuestionCard key={id} question={rec.question} ask={rec.ask} onSend={send} />
        </div>
        <Composer onSubmit={(q) => onAsk(q)} placeholder="問一個新問題…" foot={foot} />
      </main>
    );
  }

  // Still writing the lesson itself, or it failed.
  if (rec.status !== 'ready' || !rec.lesson) {
    const failed = rec.status === 'error';
    const d = rec.draft;
    return (
      <main className="panel view-in">
        <header className="bar">
          <div className="crumb">
            {d?.crumbs?.map((c) => <Fragment key={c}>{c}<Icon.chevron /></Fragment>)}
            <b>{failed ? '沒有生成成功' : '正在準備這一課'}</b>
          </div>
          <Refs refs={rec.refs} />
        </header>
        <div className="body">
          <div className="narr" ref={narr}><div className="narr-in">
            <Ask question={rec.question} />
            {!!rec.answers?.length && <p className="asked">{rec.answers.map((a) => a.answer).join(' · ')}</p>}
            {rec.course && <Outline course={rec.course} />}
            {d?.title && <h2 className="chap-t">{d.title}</h2>}
            {!failed && <Drafting draft={d} />}
          </div></div>
          <div className="stage">
            {failed ? (
              <div className="empty">
                <p>{rec.error}</p>
                <div className="empty-act">
                  <button type="button" className="btn" onClick={() => onAsk(rec.question)}><Icon.retry />再試一次</button>
                  {onDelete && <button type="button" className="btn danger" onClick={() => onDelete(id)}><Icon.trash />刪除這堂課</button>}
                </div>
              </div>
            ) : <div className="stage-wait"><span className="dots"><i /><i /><i /></span><span>{status}</span></div>}
          </div>
        </div>
        <Composer busy={!failed} status={status} onSubmit={(q) => onAsk(q)} placeholder="問一個新問題…" onStop={stop} foot={foot} />
      </main>
    );
  }

  const L = rec.lesson;
  const short = (rec.course?.title ?? L.title).split(/[：:]/)[0];
  const ch = chs[cur.chapter];
  const pend = rec.pending;
  const writing = pend?.status === 'generating';
  const pendAt = Math.min(pend?.at ?? chs.length - 1, chs.length - 1);
  const atEnd = ch.items[ch.items.length - 1].i <= step + 1;
  const shownPend = !!pend && pendAt === cur.chapter && atEnd;
  const drafting = shownPend && !!pend?.course;
  const writtenCourse = courseWritten(rec);
  const todo = rec.course ? rec.course.outline.slice(writtenCourse + (drafting ? 1 : 0)) : [];
  const allUnwritten = rec.course ? rec.course.outline.slice(writtenCourse) : [];
  const after = flat[step + 1];
  const rename = (name: string) => api.renameChapter(id, cur.chapter, name).then(load, (e) => setStatus(`沒辦法改名：${e}`));
  const showChapterMenu = chs.length > 1 || !!rec.course;

  return (
    <main className={`panel view-in${stageExpanded ? ' expanded' : ''}`}>
      <header className="bar">
        <div className="crumb">
          {L.crumbs.filter((c) => c !== short).map((c) => <Fragment key={c}>{c}<Icon.chevron /></Fragment>)}
          <b>{short}</b>
        </div>
        <Refs refs={rec.refs} />
        {showChapterMenu && (
          <ChapterMenu
            chs={chs} step={step} current={cur.chapter} onPick={toChapter}
            course={rec.course} unwritten={allUnwritten} writingCourse={writing && !!pend?.course}
            onResumeCourse={!writing && allUnwritten.length > 0 ? resumeCourse : undefined}
          />
        )}
        <span className="sp" />
        <Ticks chs={chs} step={step} go={(n) => go(n, n === step + 1)} />
        <span className="count tnum">{step + 1} / {total}</span>
        <button type="button" className="ib" onClick={prev} disabled={step === 0} aria-label="上一步" title="上一步（←）"><Icon.left /></button>
        {after
          ? <button type="button" className="go" onClick={next} title="繼續（→）">{after.chapter !== cur.chapter ? '下一章' : '繼續'}<Icon.right /></button>
          : writing ? <span className="fin wait">{pend?.course ? '正在寫下一章' : '正在回答'}</span>
          : <span className="fin"><Icon.check />學完了</span>}
      </header>
      <div className={`body${stageExpanded ? ' stage-full' : ' split'}${draggingSplit ? ' dragging' : ''}`}>
        {!stageExpanded && (
          <>
            <div className="narr" ref={narr}><div className="narr-in">
              {chs.slice(0, cur.chapter).map((c, n) => <Folded key={n} n={n} ch={c} onClick={() => toChapter(n)} />)}
              {ch.planned ? <p className="goal">{ch.question}</p> : <Ask question={ch.question} />}
              <Title key={cur.chapter} ch={ch} onRename={rename} />
              {ch.items.map((it) => it.i <= step + 1 && (
                <Fragment key={it.i}>
                  {it.asked && it.part > 0 && it.i !== ch.items[0].i && <Ask question={it.asked} />}
                  <p
                    className={`para ${it.kind === 'text' ? 'reply ' : ''}${it.i < step ? 'past' : it.i === step ? 'now' : 'next'}`}
                    onClick={() => it.i !== step && go(it.i, it.i === step + 1)}
                  >{rich(it.text)}</p>
                  {it.sources && it.i <= step && <Sources files={it.sources} />}
                </Fragment>
              ))}
              {!after && !writing && !shownPend && (
                <div className="done-card">
                  <span className="done-ic"><Icon.check /></span>
                  <div className="done-tx">
                    <b>{allUnwritten.length > 0 ? '這一章看完了' : '這一課學完了'}</b>
                  </div>
                  <div className="done-act">
                    {allUnwritten.length > 0 ? (
                      <button type="button" className="go" onClick={resumeCourse}>接著寫下一章<Icon.right /></button>
                    ) : (
                      <>
                        <button type="button" className="go muted" onClick={() => go(0, false)} title="回到第一步"><Icon.restart />重看</button>
                        {onHome && <button type="button" className="go" onClick={onHome}>下一堂課<Icon.right /></button>}
                      </>
                    )}
                  </div>
                </div>
              )}
              {shownPend && pend && (
                <div className="chap-pending">
                  {pend.course ? <p className="goal">{pend.question}</p> : <Ask question={pend.question} />}
                  {pend.draft?.mode === 'chapter' && pend.draft.title && <h2 className="chap-t">{pend.draft.title}</h2>}
                  {writing
                    ? <Drafting draft={pend.draft} />
                    : <div className="perr"><span>{pend.error}</span><button type="button" className="btn" onClick={() => (pend.course ? resumeCourse() : follow(pend.question, pendAt))}><Icon.retry />再試一次</button></div>}
                </div>
              )}
              {chs.slice(cur.chapter + 1).map((c, n) => <Folded key={n} n={cur.chapter + 1 + n} ch={c} onClick={() => toChapter(cur.chapter + 1 + n)} />)}
              {todo.map((c, n) => (
                <div key={n} className="folded todo">
                  <span className="no tnum">{chs.length + (drafting ? 2 : 1) + n}</span>
                  <span className="ft">{c.title}</span>
                  {n === 0 && !writing && !drafting
                    ? <button type="button" className="go" onClick={resumeCourse}>接著寫<Icon.right /></button>
                    : <span className="fs">{n === 0 && writing && pend?.course ? '撰寫中' : '還沒寫'}</span>}
                </div>
              ))}
            </div></div>
            <div
              className="resizer" role="separator" aria-orientation="vertical" aria-label="調整講解欄寬度"
              title="拖曳調整寬度，雙擊還原"
              onPointerDown={startResize}
              onDoubleClick={() => {
                document.documentElement.style.setProperty('--col', `${DEFAULT_NARR_WIDTH}px`);
                update?.({ narrWidth: DEFAULT_NARR_WIDTH });
              }}
            />
          </>
        )}
        <div className="stage">
          <div className="stage-hd">
            <p className="task">{ch.tasks[cur.version]}</p>
            <div className={`stage-tools${stageDirty || stageExpanded ? ' show' : ''}`}>
              {stageDirty && (
                <button type="button" className="st-btn acc" onClick={() => widget.current?.reset?.()} title="還原為這一步的狀態">
                  <Icon.restart />還原
                </button>
              )}
              <button type="button" className="st-btn" onClick={replay} title="重播這一步的動畫（R）" aria-label="重播這一步的動畫">
                <Icon.retry />
              </button>
              <button
                type="button" className="st-btn" onClick={() => setStageExpanded((v) => !v)}
                title={stageExpanded ? '還原雙欄檢視（F）' : '全畫面展開舞台（F）'}
                aria-label={stageExpanded ? '還原雙欄檢視' : '全畫面展開舞台'}
              >
                {stageExpanded ? <Icon.shrink /> : <Icon.expand />}
              </button>
            </div>
          </div>
          <div className="wbox">
            <WidgetFor
              key={widgetKey} widget={ch.versions[cur.version]} steps={ch.steps} step={cur.local} animate={animate}
              handle={widget} onDirtyChange={setStageDirty}
              onFix={writing ? undefined : (msg) => follow(`（視覺出錯，請修好它並保持原本的內容）錯誤訊息：${msg}`, cur.chapter)}
            />
          </div>
          {stageExpanded && (
            <div className="stage-dock">
              <p className="dock-txt">{rich(cur.text)}</p>
              <div className="dock-ctrl">
                <button type="button" className="ib" onClick={prev} disabled={step === 0} aria-label="上一步"><Icon.left /></button>
                <span className="tnum dock-cnt">{step + 1} / {total}</span>
                <button type="button" className="go" onClick={next} disabled={!after}>{after ? '繼續' : '學完了'}{after && <Icon.right />}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {!stageExpanded && (
        <Composer
          busy={writing} status={status} suggestions={lastSuggestions(rec)} focusOnSlash
          onSubmit={(q) => follow(q, cur.chapter)} placeholder={chs.length > 1 ? `追問第 ${cur.chapter + 1} 章…` : '追問這一課…'} onStop={stop} foot={foot}
        />
      )}
    </main>
  );
}

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** The folders the lesson reads from, as one quiet badge in the top bar. */
function Refs({ refs }: { refs?: string[] }) {
  if (!refs?.length) return null;
  return (
    <span className="refs-badge" title={refs.join('\n')}>
      <Icon.folder />{refs.map(baseName).join('、')}
    </span>
  );
}

/** The reference files an answer was written from. */
function Sources({ files }: { files: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, 4);
  return (
    <div className="srcs" aria-label="參考的檔案">
      {shown.map((f) => <span key={f} className="src" title={f}><Icon.file />{baseName(f)}</span>)}
      {files.length > shown.length && <button type="button" className="src more" onClick={() => setAll(true)}>+{files.length - shown.length}</button>}
    </div>
  );
}

function Ask({ question }: { question: string }) {
  return <p className="asked">{question}</p>;
}

/** The course's plan, shown while its first chapter is written. */
function Outline({ course }: { course: Course }) {
  return (
    <div className="outline">
      <h2 className="chap-t">{course.title}</h2>
      <ol>{course.outline.map((c, n) => <li key={n}><span className="no tnum">{n + 1}</span><span><b>{c.title}</b><span>{c.goal}</span></span></li>)}</ol>
    </div>
  );
}

/**
 * The questions Claude asked before teaching. Options toggle (several, where the question allows);
 * a line of the learner's own words counts as an answer too.
 */
function QuestionCard({ question, ask, onSend }: { question: string; ask: Questions; onSend: (a: Answer[]) => void }) {
  const [pick, setPick] = useState<Record<string, string[]>>({});
  const [own, setOwn] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const toggle = (q: Questions['questions'][number], o: string) => setPick((p) => {
    const cur = p[q.id] ?? [];
    const on = cur.includes(o);
    return { ...p, [q.id]: q.multi ? (on ? cur.filter((x) => x !== o) : [...cur, o]) : (on ? [] : [o]) };
  });
  const answers = ask.questions
    .map((q) => ({ question: q.text, answer: [...(pick[q.id] ?? []), own[q.id]?.trim()].filter(Boolean).join('、') }))
    .filter((a) => a.answer);
  const send = (a: Answer[]) => { if (sent) return; setSent(true); onSend(a); };
  return (
    <div className="qcol">
      <p className="asked">{question}</p>
      {ask.text && <p className="qlead">{rich(ask.text)}</p>}
      {ask.questions.map((q, idx) => (
        <fieldset key={q.id} className="qq" disabled={sent} style={{ animationDelay: `${idx * 55}ms` }}>
          <legend>{q.text}{q.multi && <span className="qm">可複選</span>}</legend>
          <div className="qopts">
            {q.options.map((o) => {
              const on = pick[q.id]?.includes(o) ?? false;
              return <button key={o} type="button" className={`opt${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(q, o)}>{on && <Icon.check />}{o}</button>;
            })}
            <input
              className="own" placeholder="其他…" value={own[q.id] ?? ''} aria-label={`${q.text}：自己寫`}
              onChange={(e) => setOwn((p) => ({ ...p, [q.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && answers.length) send(answers); }}
            />
          </div>
        </fieldset>
      ))}
      <div className="qgo">
        <button type="button" className="primary" disabled={sent || !answers.length} onClick={() => send(answers)}>
          {sent ? '準備上課…' : '開始上課'}{!sent && <Icon.right />}
        </button>
        <button type="button" className="go skip" disabled={sent} onClick={() => send([])}>跳過，讓 Claude 決定</button>
        {ask.questions.length > 1 && answers.length > 0 && (
          <span className="qcount tnum">已答 {answers.length} / {ask.questions.length}</span>
        )}
      </div>
    </div>
  );
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
      <button type="button" className="ren" onClick={() => { setVal(ch.title); setEdit(true); }} aria-label="重新命名這一章" title="重新命名"><Icon.pencil /></button>
    </h2>
  );
}

/** A chapter that is not being read: one row that jumps to it. */
function Folded({ n, ch, onClick }: { n: number; ch: Chapter; onClick: () => void }) {
  return (
    <button type="button" className="folded" onClick={onClick}>
      <span className="no tnum">{n + 1}</span>
      <span className="ft">{ch.title}</span>
      <span className="fs tnum">{ch.items.length} 段</span>
    </button>
  );
}

/** The chapter switcher in the top bar, including course outline progress when present. */
function ChapterMenu({ chs, step, current, onPick, course, unwritten, writingCourse, onResumeCourse }: {
  chs: Chapter[];
  step: number;
  current: number;
  onPick: (c: number) => void;
  course?: Course;
  unwritten: Course['outline'];
  writingCourse: boolean;
  onResumeCourse?: () => void;
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
  const totalCount = course ? Math.max(chs.length, course.outline.length) : chs.length;
  return (
    <div className="chapters" ref={box}>
      <button type="button" className={`chap-btn${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        {writingCourse && <i className="chap-live" />}
        <span className="tnum">第 {current + 1} / {totalCount} 章</span><Icon.down />
      </button>
      {open && (
        <div className="menu" role="menu">
          {chs.map((c, n) => {
            const read = c.items.filter((it) => it.i <= step).length;
            const pct = c.items.length ? (read / c.items.length) * 100 : 0;
            return (
              <button key={n} type="button" role="menuitem" className={`mi${n === current ? ' on' : ''}`} onClick={() => { onPick(n); setOpen(false); }}>
                <span className="no tnum">{n + 1}</span>
                <span className="mt">
                  <b>{c.title}</b>
                  <span>{c.question}</span>
                  <i className="mi-bar"><i style={{ width: `${pct}%` }} /></i>
                </span>
                <span className="ms tnum">{read} / {c.items.length}</span>
              </button>
            );
          })}
          {unwritten.map((c, n) => (
            <div key={`u-${n}`} className="mi todo">
              <span className="no tnum">{chs.length + n + 1}</span>
              <span className="mt"><b>{c.title}</b><span>{c.goal}</span></span>
              {n === 0 && onResumeCourse ? (
                <button type="button" className="go mi-go" onClick={() => { setOpen(false); onResumeCourse(); }}>接著寫<Icon.right /></button>
              ) : (
                <span className="ms">{n === 0 && writingCourse ? '撰寫中' : '未寫'}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const stripRich = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');

/** Progress ticks, grouped by chapter; hovering previews the step snippet. */
function Ticks({ chs, step, go }: { chs: Chapter[]; step: number; go: (n: number) => void }) {
  const [hover, setHover] = useState<{ it: Item; chTitle: string; x: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  return (
    <div className="prog" ref={box} onMouseLeave={() => setHover(null)}>
      {chs.map((c, n) => (
        <span key={n} className="pg">
          {c.items.map((it) => (
            <button
              key={it.i} type="button"
              className={`${it.i < step ? 'd' : it.i === step ? 'n' : ''}${it.kind === 'text' ? ' t' : ''}`}
              onClick={() => go(it.i)}
              onMouseEnter={(e) => {
                const br = box.current?.getBoundingClientRect();
                const tr = e.currentTarget.getBoundingClientRect();
                if (!br) return;
                const raw = tr.left - br.left + tr.width / 2;
                const maxRight = Math.max(0, window.innerWidth - br.left - 132);
                const x = Math.max(120 - br.left, Math.min(maxRight, raw));
                setHover({ it, chTitle: c.title, x });
              }}
              aria-label={`第 ${it.i + 1} 段`}
            />
          ))}
        </span>
      ))}
      {hover && (
        <div className="tick-pop" style={{ left: `${hover.x}px` }} role="tooltip">
          <div className="tp-hd">
            <span className="tnum">第 {hover.it.i + 1} 段</span>
            {chs.length > 1 && <span>· {hover.chTitle}</span>}
          </div>
          <p>{stripRich(hover.it.text)}</p>
        </div>
      )}
    </div>
  );
}

/** Interactive model & effort picker on the left, live cost popover on the right. */
function GenFoot({ gen, settings, update, cost }: {
  gen: Gen; settings?: Settings; update?: (p: Partial<Settings>) => void; cost?: Cost;
}) {
  return (
    <>
      {settings && update
        ? <GenPicker settings={settings} update={update} showAskFirst={false} up />
        : <span className="chip"><i />{MODEL_LABEL[gen.model]}{` · ${EFFORT_LABEL[gen.effort]}`}</span>}
      {cost && <CostTag cost={cost} />}
    </>
  );
}

export function CostTag({ cost }: { cost: Cost }): ReactNode {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', away);
    addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc); };
  }, [open]);
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const totalIn = cost.input + cost.cacheRead + cost.cacheWrite;
  const hit = totalIn > 0 ? Math.round((cost.cacheRead / totalIn) * 100) : 0;
  return (
    <span className="cost-w" ref={box}>
      <button type="button" className={`cost tnum${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        本課 {usd(cost.usd)}
      </button>
      {open && (
        <div className="cost-pop" role="dialog" aria-label="本課 Token 用量">
          <div className="cp-row"><span>輸入</span><b className="tnum">{k(cost.input)}</b></div>
          <div className="cp-row"><span>輸出</span><b className="tnum">{k(cost.output)}</b></div>
          <div className="cp-row"><span>快取讀取</span><b className="tnum">{k(cost.cacheRead)}</b></div>
          <div className="cp-row"><span>快取寫入</span><b className="tnum">{k(cost.cacheWrite)}</b></div>
          {totalIn > 0 && <div className="cp-row sep"><span>快取命中率</span><b className="tnum">{hit}%</b></div>}
        </div>
      )}
    </span>
  );
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

function WidgetFor({ widget: w, steps, step, animate, handle, onDirtyChange, onFix }: {
  widget: Widget;
  steps: Step[];
  step: number;
  animate: boolean;
  handle: React.RefObject<WidgetHandle | null>;
  onDirtyChange?: (dirty: boolean) => void;
  onFix?: (message: string) => void;
}) {
  const [err, setErr] = useState('');
  const body = (() => {
    if (w.kind === 'bubble-sort' && w.values?.length) return <BubbleSort ref={handle} values={w.values} steps={steps} step={step} animate={animate} onDirtyChange={onDirtyChange} />;
    if (w.kind === 'plot' && w.plot) return <PlotWidget ref={handle} spec={w.plot} steps={steps} step={step} animate={animate} onDirtyChange={onDirtyChange} />;
    if (w.kind === 'html' && w.html) return <HtmlWidget ref={handle} html={w.html} step={step} animate={animate} onError={(m) => setErr((e) => e || m)} />;
    if ((KIT_KINDS as readonly string[]).includes(w.kind) && w[w.kind as KitKind]) {
      return <HtmlWidget ref={handle} html={kitBody(w, steps)} kit step={step} animate={animate} onError={(m) => setErr((e) => e || m)} />;
    }
    return null;
  })();
  if (!body) return <div className="empty">這一課的元件格式不對，沒辦法顯示。</div>;
  return (
    <>
      {body}
      {err && (
        <div className="werr" role="status">
          <span>這個視覺出了點問題</span>
          {onFix && <button type="button" className="go" onClick={() => { onFix(err); setErr(''); }}>請 Claude 修好<Icon.right /></button>}
          <button type="button" className="ib" onClick={() => setErr('')} aria-label="關閉"><Icon.x /></button>
        </div>
      )}
    </>
  );
}
