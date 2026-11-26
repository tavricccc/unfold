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
          <h1>今天想<em>弄懂</em>什麼？</h1>
          <p className="lead">問一個問題，它會一步一步展開成一堂可以動手玩的課。</p>
          <Composer big autoFocus onSubmit={onAsk} placeholder="一個問題、一個好奇、一個卡住的地方…" />
          <div className="under"><span className="chip"><i />{MODEL_LABEL[model]}</span><span>Enter 送出 · Shift + Enter 換行</span></div>
          <div className="try"><span className="lbl">試試</span>{TRY.map((t) => <button key={t} className="sg" onClick={() => onAsk(t)}>{t}</button>)}</div>
          {going.length > 0 && (
            <div className="cont">
              <h2>接著學</h2>
              <div className="cont-list">
                {going.map((l) => (
                  <button key={l.id} className="rowl" onClick={() => open(l.id)}>
                    <span className="ic">{subjectIcon(l.subject)}</span>
                    <b>{l.title}</b>
                    <span className="foot">
                      <span className="bar2"><i style={{ width: `${((l.step + 1) / l.total!) * 100}%` }} /></span>
                      <span className="when tnum">{l.step + 1} / {l.total} 步</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
