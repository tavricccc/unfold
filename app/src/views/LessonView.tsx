import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Composer } from '../components/Composer';
import { Icon, rich } from '../icons';
import type { Lesson, LessonRecord } from '../lesson';
import { BubbleSort } from '../widgets/BubbleSort';
import { HtmlWidget } from '../widgets/HtmlWidget';
import { PlotWidget } from '../widgets/Plot';
import type { WidgetHandle } from '../widgets/types';

export function LessonView({ id, onAsk, onProgress }: {
  id: string; onAsk: (q: string, context?: string) => void; onProgress: () => void;
}) {
  const [rec, setRec] = useState<LessonRecord | null>(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState('正在讀你的問題…');
  const [step, setStep] = useState(0);
  const [animate, setAnimate] = useState(false);
  const widget = useRef<WidgetHandle>(null);

  const load = useCallback(() => {
    api.getLesson(id).then((r) => { setRec(r); setStep(r.step); setAnimate(false); }, (e) => setLoadError(String(e)));
  }, [id]);

  useEffect(() => {
    load();
    return api.onLessonEvent((e) => {
      if (e.id !== id) return;
      if (e.type === 'status') setStatus(e.text);
      else if (e.type === 'partial') setRec((r) => (r && r.status === 'generating' ? { ...r, draft: e.lesson } : r));
      else load();
    });
  }, [id, load]);

  const total = rec?.lesson?.steps.length ?? 0;

  const go = useCallback((n: number, anim: boolean) => {
    if (n < 0 || n >= total) return;
    setAnimate(anim);
    setStep(n);
    api.setProgress(id, n).then(onProgress, (e) => console.error('save progress failed', e));
  }, [id, total, onProgress]);

  const next = useCallback(() => {
    if (widget.current?.busy()) widget.current.finish();
    else go(step + 1, true);
  }, [go, step]);
  const prev = useCallback(() => go(step - 1, false), [go, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('textarea, input, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [next, prev]);

  if (loadError) return <main className="panel plain"><header className="bar" /><div className="empty">讀不到這一課：{loadError}</div></main>;
  if (!rec) return <main className="panel plain"><header className="bar" /></main>;

  if (rec.status !== 'ready' || !rec.lesson) {
    const failed = rec.status === 'error';
    const d = rec.draft;
    const drafted = d?.steps ?? [];
    return (
      <main className="panel">
        <header className="bar">
          <div className="crumb">
            {d?.crumbs?.map((c) => <Fragment key={c}>{c}<Icon.chevron /></Fragment>)}
            <b>{failed ? '沒有生成成功' : '正在準備這一課'}</b>
          </div>
        </header>
        <div className="body">
          <div className="lesson">
            <div className="lhead"><div className="t">{d?.title ?? rec.question}</div>{d?.title && <div className="q">你問：{rec.question}</div>}</div>
            {!failed && (
              <ol className="steps">
                {drafted.map((st, i) => <li key={i} className="step draft"><span className="n">{i + 1}</span><p>{rich(st.text)}</p></li>)}
                <li className="skel"><i /><i style={{ width: '70%' }} /></li>
              </ol>
            )}
          </div>
          <div className="stage">
            {failed ? (
              <div className="empty">
                <p>{rec.error}</p>
                <button className="btn" onClick={() => onAsk(rec.question)}><Icon.retry />再試一次</button>
              </div>
            ) : <div className="stage-wait"><span className="dots"><i /><i /><i /></span><span>{status}</span></div>}
          </div>
        </div>
        <Composer
          busy={!failed} status={status} onSubmit={(q) => onAsk(q)} placeholder="追問這一課，或問一個新問題…"
          onStop={() => api.cancelLesson(id).catch((e) => setStatus(`停不下來：${e}`))}
        />
      </main>
    );
  }

  const L = rec.lesson;
  const short = L.title.split(/[：:]/)[0];
  return (
    <main className="panel">
      <header className="bar">
        <div className="crumb">
          {L.crumbs.filter((c) => c !== short).map((c) => <Fragment key={c}>{c}<Icon.chevron /></Fragment>)}
          <b>{short}</b>
        </div>
        <span className="sp" />
        <div className="prog">{L.steps.map((_, i) => <i key={i} className={i < step ? 'd' : i === step ? 'n' : ''} />)}</div>
        <span className="pill tnum">{step + 1} / {total}</span>
      </header>
      <div className="body">
        <div className="lesson">
          <div className="lhead"><div className="t">{L.title}</div><div className="q">你問：{rec.question}</div></div>
          <ol className="steps">
            {L.steps.map((s, i) => i <= step + 1 && (
              <li key={i} ref={i === step ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) : undefined} className={`step ${i < step ? 'd' : i === step ? 'now' : 'later'}`} onClick={() => i !== step && go(i, i === step + 1)}>
                <span className="n">{i + 1}</span><p>{rich(s.text)}</p>
              </li>
            ))}
          </ol>
          <div className="lfoot">
            <button className="btn" onClick={prev} disabled={step === 0}><Icon.left />上一步</button>
            {step < total - 1
              ? <button className="primary" onClick={next}>下一步 <kbd>→</kbd></button>
              : <span className="fin"><Icon.check />這一課學完了</span>}
          </div>
        </div>
        <div className="stage">
          <div className="task"><span className="tag">試試看</span><span>{L.task}</span></div>
          <div className="wbox"><WidgetFor lesson={L} step={step} animate={animate} widget={widget} /></div>
        </div>
      </div>
      <Composer suggestions={L.suggestions} onSubmit={(q) => onAsk(q, L.title)} placeholder="追問這一課，或問一個新問題…" />
    </main>
  );
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
