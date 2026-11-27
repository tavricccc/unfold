import { useEffect, useState } from 'react';
import { api, type Ref } from '../api';
import { Composer } from '../components/Composer';
import { GenPicker } from '../components/GenPicker';
import { Icon, subjectIcon } from '../icons';
import type { LessonMeta } from '../lesson';
import type { Settings } from '../settings';

const TRY_SETS = [
  ['泡泡排序是怎麼運作的？', '用動畫證明畢氏定理', '導數到底在算什麼', '為什麼斜著丟會畫出拋物線'],
  ['二分搜尋的程式碼怎麼一步步跑？', '光合作用的光反應與碳反應', '工業革命為什麼從英國開始？', '通膨和升息之間是什麼關係？'],
  ['用隨堂測驗考考我導數觀念', '為什麼冰塊會浮在水上？', '《論語・學而》首章在講什麼？', '整課：從頭學懂二次函數'],
];
/** With a folder attached: questions about a project or a pile of documents. */
const REF_TRY = ['這個專案的架構長怎樣？', '從啟動到畫面出來，程式怎麼跑？', '核心的原理是什麼？', '整理這些文件的重點'];

const INSTALL = 'irm https://claude.ai/install.ps1 | iex';

export function Home({ lessons, settings, update, onAsk, open, onError, claude, onRecheck }: {
  lessons: LessonMeta[]; settings: Settings; update: (p: Partial<Settings>) => void;
  claude: { ok: boolean; text: string }; onRecheck: () => void;
  /** refs: the folders attached to the new lesson */
  onAsk: (q: string, refs?: string[]) => void; open: (id: string) => void; onError: (msg: string) => void;
}) {
  const [setIdx, setSetIdx] = useState(0);
  const [refs, setRefs] = useState<Ref[]>([]);
  const [dragging, setDragging] = useState(false);

  const attach = async (paths: string[]) => {
    const got: Ref[] = [];
    for (const p of paths) {
      try { got.push(await api.inspectRef(p)); } catch (e) { onError(`沒辦法附上：${e}`); }
    }
    setRefs((cur) => [...cur, ...got.filter((g) => !cur.some((c) => c.path.toLowerCase() === g.path.toLowerCase()))].slice(0, 8));
  };
  const pick = () => api.pickFolders().then(attach, (e) => onError(`沒辦法開啟資料夾：${e}`));
  const drop = (paths: string[]) => attach(paths);
  useEffect(() => api.onDrop((e) => {
    setDragging(e.phase === 'over');
    if (e.phase === 'drop' && e.paths.length) drop(e.paths);
  }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = (q: string) => { onAsk(q, refs.map((r) => r.path)); setRefs([]); };
  const tries = refs.length ? REF_TRY : TRY_SETS[setIdx];

  const active = lessons
    .filter((l) => l.status === 'asking' || l.status === 'generating' || (l.status === 'ready' && l.total && l.step < l.total - 1))
    .slice(0, 3);
  const recent = active.length > 0 ? active : lessons.filter((l) => l.status === 'ready').slice(0, 3);
  const sectionLabel = active.length > 0 ? '接著學' : '最近學過';

  return (
    <main className={`panel plain view-in${dragging ? ' dropping' : ''}`}>
      {dragging && <div className="drop-hint" aria-hidden="true"><Icon.folder />放開來，附上這個資料夾</div>}
      <header className="bar"><div className="crumb"><b>問一問</b></div></header>
      <section className="home">
        <div className="col">
          <svg className="art" width="200" height="118" viewBox="0 0 200 118" aria-hidden="true">
            <g className="fold-l">
              <path className="f f2" d="M18 92 54 70 54 30 18 52z" />
              <path className="ln2" d="M26 60l20-12M26 68l14-8" />
            </g>
            <g className="fold-m1">
              <path className="f" d="M54 70 92 84 92 44 54 30z" />
              <path className="ln2" d="M64 46l18 6M64 54l14 5" />
            </g>
            <g className="fold-m2">
              <path className="f f2" d="M92 84 130 62 130 22 92 44z" />
              <circle className="acc" cx="111" cy="52" r="6" />
            </g>
            <g className="fold-r">
              <path className="f" d="M130 62 182 80 182 40 130 22z" />
              <path className="ln2" d="M140 36l30 10M140 44l22 7M140 52l26 9" />
            </g>
            <path d="M14 104h172" stroke="var(--line-2)" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <h1>今天想<em>弄懂</em>什麼？</h1>
          <p className="lead">問一個問題，它會一步一步展開成一堂可以動手玩的課。</p>
          {!claude.ok && (
            <div className="setup" role="alert">
              <div className="setup-t">
                <b>先裝好 Claude Code</b>
                <span>在 PowerShell 執行下面這行，裝好後跑一次 <code>claude</code> 登入</span>
                <code className="setup-cmd">{INSTALL}</code>
              </div>
              <div className="setup-act">
                <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(INSTALL).catch(() => onError('沒辦法複製'))}>複製</button>
                <button type="button" className="btn" onClick={onRecheck}><Icon.retry />重新檢查</button>
              </div>
            </div>
          )}
          <Composer
            big autoFocus focusOnSlash onSubmit={ask}
            placeholder={refs.length ? '問這些資料：架構、原理、某份文件在講什麼…' : '一個問題、一個好奇、一個卡住的地方…'}
            foot={<>
              <GenPicker settings={settings} update={update} />
              <span className="refs">
                {refs.map((r) => (
                  <span key={r.path} className="chip ref" title={r.path}>
                    <Icon.folder /><span className="nm">{r.name}</span>
                    <button type="button" className="ref-x" aria-label={`移除 ${r.name}`} onClick={() => setRefs((cur) => cur.filter((c) => c.path !== r.path))}><Icon.x /></button>
                  </span>
                ))}
                <button type="button" className="chip pb add-ref" onClick={pick} title="附上資料夾，讓它照裡面的程式或文件來教；也可以直接拖進視窗">
                  <Icon.folder />{refs.length ? '再加' : '參考資料夾'}
                </button>
              </span>
              <span className="hint">Enter 送出 · Shift + Enter 換行</span>
            </>}
          />
          <div className="try">
            <span className="lbl">試試</span>
            {tries.map((t) => <button key={t} type="button" className="sg" onClick={() => ask(t)}>{t}</button>)}
            {!refs.length && (
              <button
                type="button" className="try-next" onClick={() => setSetIdx((i) => (i + 1) % TRY_SETS.length)}
                aria-label="換一組範例問題" title="換一組"
              >
                <Icon.shuffle />
              </button>
            )}
          </div>
          {recent.length > 0 && (
            <div className="cont">
              <h2>{sectionLabel}</h2>
              <div className="cont-list">
                {recent.map((l) => {
                  const waiting = l.status === 'asking';
                  const live = l.status === 'generating';
                  const done = l.status === 'ready' && !!l.total && l.step >= l.total - 1;
                  const pct = l.total ? ((l.step + 1) / l.total) * 100 : 0;
                  return (
                    <button key={l.id} type="button" className={`rowl${waiting ? ' ask-card' : ''}`} onClick={() => open(l.id)}>
                      <span className="rowl-top">
                        <span className="ic">{subjectIcon(l.subject)}</span>
                        {waiting && <span className="badge acc">等你回答</span>}
                        {live && <span className="badge live"><i />準備中</span>}
                        {done && <span className="badge done">已學完</span>}
                      </span>
                      <b>{l.title ?? l.question}</b>
                      <span className="foot">
                        {waiting ? (
                          <span className="when">回答幾個問題就能開始</span>
                        ) : live ? (
                          <span className="when">正在展開課程內容…</span>
                        ) : (
                          <>
                            <span className="bar2"><i style={{ width: `${pct}%` }} /></span>
                            <span className="when tnum">{l.step + 1} / {l.total} 步</span>
                          </>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
