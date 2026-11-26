import { Composer } from '../components/Composer';
import { subjectIcon } from '../icons';
import type { LessonMeta } from '../lesson';
import { MODEL_LABEL, type Model } from '../settings';

const TRY = ['泡泡排序是怎麼運作的？', '用動畫證明畢氏定理', '導數到底在算什麼', '為什麼斜著丟會畫出拋物線'];

export function Home({ lessons, model, onAsk, open }: {
  lessons: LessonMeta[]; model: Model; onAsk: (q: string) => void; open: (id: string) => void;
}) {
  const going = lessons.filter((l) => l.status === 'ready' && l.total && l.step < l.total - 1).slice(0, 3);
  return (
    <main className="panel plain">
      <header className="bar"><div className="crumb"><b>新的課</b></div></header>
      <section className="home">
        <div className="col">
          <svg className="art" width="200" height="118" viewBox="0 0 200 118" aria-hidden="true">
            <path className="f f2" d="M18 92 54 70 54 30 18 52z" />
            <path className="f" d="M54 70 92 84 92 44 54 30z" />
            <path className="f f2" d="M92 84 130 62 130 22 92 44z" />
            <path className="f" d="M130 62 182 80 182 40 130 22z" />
            <path className="ln2" d="M64 46l18 6M64 54l14 5M140 36l30 10M140 44l22 7M140 52l26 9" />
            <circle className="acc" cx="111" cy="52" r="6" />
            <path className="ln2" d="M26 60l20-12M26 68l14-8" />
            <path d="M14 104h172" stroke="var(--line-2)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <h1>今天想弄懂什麼？</h1>
          <p className="lead">問一個問題，它會一步一步展開成一堂可以動手玩的課。</p>
          <Composer big autoFocus onSubmit={onAsk} placeholder="一個問題、一個好奇、一個卡住的地方…" />
          <div className="under"><span className="chip"><i />{MODEL_LABEL[model]}</span><span>Enter 送出 · Shift + Enter 換行</span></div>
          <div className="try"><span className="lbl">試試</span>{TRY.map((t) => <button key={t} className="sg" onClick={() => onAsk(t)}>{t}</button>)}</div>
          {going.length > 0 && (
            <div className="cont">
              <h2>接著學</h2>
              {going.map((l) => (
                <button key={l.id} className="rowl" onClick={() => open(l.id)}>
                  <span className="ic">{subjectIcon(l.subject)}</span>
                  <span><b>{l.title}</b></span>
                  <span className="bar2"><i style={{ width: `${((l.step + 1) / l.total!) * 100}%` }} /></span>
                  <span className="when tnum">{l.step + 1} / {l.total} 步</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
