import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { EFFORTS, EFFORT_LABEL, FONT_SIZE_LABEL, MODEL_LABEL, type Accent, type FontSize, type Model, type Settings, type Theme } from '../settings';

const GITHUB = 'tavricccc';
const THEMES: [Theme, string][] = [['light', '淺色'], ['dark', '深色'], ['system', '跟隨系統']];
const ACCENTS: [Accent, string, string][] = [['orange', '橘', '#c4521b'], ['teal', '青', '#0d7480'], ['coral', '珊瑚', '#c43b3b'], ['mono', '石板', '#1f3038']];
const SIZES: FontSize[] = ['sm', 'md', 'lg'];
const MODELS: [Model, string][] = [['sonnet', '快，適合大部分問題'], ['opus', '最強，適合難題，比較慢'], ['haiku', '最快，講解比較簡短']];

export function SettingsView({ settings, update, claude, onRecheck, onShowShortcuts }: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  claude: { ok: boolean; text: string };
  onRecheck?: () => Promise<void>;
  onShowShortcuts?: () => void;
}) {
  const [checking, setChecking] = useState(false);

  const recheck = async () => {
    if (!onRecheck || checking) return;
    setChecking(true);
    try { await onRecheck(); } finally { setChecking(false); }
  };

  return (
    <main className="panel plain view-in">
      <header className="bar"><div className="crumb"><b>設定</b></div></header>
      <div className="sc"><div className="scol">
        <section className="sec">
          <h2>外觀與閱讀</h2>
          <div className="card">
            <div className="row">
              <div className="k">主題</div>
              <div className="v"><div className="seg">{THEMES.map(([t, l]) => <button key={t} type="button" className={settings.theme === t ? 'on' : ''} onClick={() => update({ theme: t })}>{l}</button>)}</div></div>
            </div>
            <div className="row">
              <div className="k">強調色</div>
              <div className="v"><div className="sws">{ACCENTS.map(([a, l, c]) => (
                <button key={a} type="button" className={`swc${settings.accent === a ? ' on' : ''}`} onClick={() => update({ accent: a })} aria-pressed={settings.accent === a}>
                  <i style={{ background: c, boxShadow: a === 'mono' ? 'inset 0 0 0 1px var(--line-2)' : undefined }}>{settings.accent === a && <span style={{ color: '#fff' }}><Icon.check /></span>}</i>{l}
                </button>
              ))}</div></div>
            </div>
            <div className="row">
              <div className="k">講解字級</div>
              <div className="v"><div className="seg">{SIZES.map((sz) => <button key={sz} type="button" className={settings.fontSize === sz ? 'on' : ''} onClick={() => update({ fontSize: sz })}>{FONT_SIZE_LABEL[sz]}</button>)}</div></div>
            </div>
            <div className="row">
              <div className="k">減少動態效果</div>
              <div className="v">
                <button
                  type="button" role="switch" aria-checked={settings.reducedMotion}
                  className={`sw-btn${settings.reducedMotion ? ' on' : ''}`}
                  onClick={() => update({ reducedMotion: !settings.reducedMotion })}
                ><i /></button>
              </div>
            </div>
          </div>
        </section>
        <section className="sec">
          <h2>Claude Code</h2>
          <div className="card">
            <div className="row one">
              <div className={`conn${claude.ok ? '' : ' bad'}`}>
                <span className="ok">{claude.ok ? <Icon.check /> : '!'}</span>
                <div className="conn-t"><div className="t">{claude.text}</div><div className="d">{claude.ok ? '透過 Agent SDK 使用你電腦上的 Claude Code' : '先安裝並登入 Claude Code，再點右側重新檢查'}</div></div>
                {onRecheck && (
                  <button type="button" className={`btn conn-re${checking ? ' spin' : ''}`} onClick={recheck} disabled={checking}>
                    <Icon.retry />{checking ? '檢查中…' : '重新檢查'}
                  </button>
                )}
              </div>
            </div>
            <div className="row top">
              <div className="k">出課模型</div>
              <div className="v"><div className="mlist">{MODELS.map(([m, d]) => (
                <button key={m} type="button" className={`mopt${settings.model === m ? ' on' : ''}`} onClick={() => update({ model: m })}>
                  <b>{MODEL_LABEL[m]}</b><span>{d}</span>
                </button>
              ))}</div></div>
            </div>
            <div className="row">
              <div className="k">思考深度</div>
              <div className="v"><div className="seg">{EFFORTS.map((e) => <button key={e} type="button" className={settings.effort === e ? 'on' : ''} onClick={() => update({ effort: e })} aria-pressed={settings.effort === e}>{EFFORT_LABEL[e]}</button>)}</div></div>
            </div>
            <div className="row">
              <div className="k">開始前先問我</div>
              <div className="v">
                <button
                  type="button" role="switch" aria-checked={settings.askFirst}
                  className={`sw-btn${settings.askFirst ? ' on' : ''}`}
                  onClick={() => update({ askFirst: !settings.askFirst })}
                ><i /></button>
              </div>
            </div>
          </div>
        </section>
        <section className="sec">
          <h2>其他</h2>
          <div className="card">
            {onShowShortcuts && (
              <div className="row">
                <div className="k">鍵盤快捷鍵</div>
                <div className="v">
                  <button type="button" className="btn" onClick={onShowShortcuts}><Icon.keyboard />檢視全部<span className="kbd">?</span></button>
                </div>
              </div>
            )}
            <div className="row one">
              <div className="author">
                <img src={`https://github.com/${GITHUB}.png?size=96`} alt="" width={36} height={36} />
                <b>{GITHUB}</b>
                <button type="button" className="go" onClick={() => api.openLink(`https://github.com/${GITHUB}`).catch((e) => console.error('open link failed', e))}>前往<Icon.out /></button>
              </div>
            </div>
          </div>
        </section>
      </div></div>
    </main>
  );
}
