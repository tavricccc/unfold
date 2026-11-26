import { Icon } from '../icons';
import { EFFORT_LABEL, MODEL_LABEL, type Accent, type Effort, type Model, type Settings, type Theme } from '../settings';

const THEMES: [Theme, string][] = [['light', '淺色'], ['dark', '深色'], ['system', '跟隨系統']];
const ACCENTS: [Accent, string, string][] = [['orange', '橘', '#c4521b'], ['teal', '青', '#0d7480'], ['coral', '珊瑚', '#c43b3b'], ['mono', '石板', '#1f3038']];
const EFFORTS = Object.keys(EFFORT_LABEL) as Effort[];
const MODELS: [Model, string][] = [['sonnet', '快，適合大部分問題'], ['opus', '最強，適合難題，比較慢'], ['haiku', '最快，講解比較簡短']];

export function SettingsView({ settings, update, claude }: {
  settings: Settings; update: (p: Partial<Settings>) => void; claude: { ok: boolean; text: string };
}) {
  return (
    <main className="panel plain">
      <header className="bar"><div className="crumb"><b>設定</b></div></header>
      <div className="sc"><div className="scol">
        <section className="sec">
          <h2>外觀</h2>
          <div className="card">
            <div className="row">
              <div className="k">主題</div>
              <div className="v"><div className="seg">{THEMES.map(([t, l]) => <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => update({ theme: t })}>{l}</button>)}</div></div>
            </div>
            <div className="row">
              <div className="k">強調色</div>
              <div className="v"><div className="sws">{ACCENTS.map(([a, l, c]) => (
                <button key={a} className={`swc${settings.accent === a ? ' on' : ''}`} onClick={() => update({ accent: a })} aria-pressed={settings.accent === a}>
                  <i style={{ background: c, boxShadow: a === 'mono' ? 'inset 0 0 0 1px var(--line-2)' : undefined }}>{settings.accent === a && <span style={{ color: '#fff' }}><Icon.check /></span>}</i>{l}
                </button>
              ))}</div></div>
            </div>
          </div>
        </section>
        <section className="sec">
          <h2>Claude Code</h2>
          <div className="card">
            <div className="row one">
              <div className={`conn${claude.ok ? '' : ' bad'}`}>
                <span className="ok">{claude.ok ? <Icon.check /> : '!'}</span>
                <div><div className="t">{claude.text}</div><div className="d">{claude.ok ? '透過 Agent SDK 使用你電腦上的 Claude Code' : '先安裝並登入 Claude Code，再重新開啟 Unfold'}</div></div>
              </div>
            </div>
            <div className="row top">
              <div className="k">出課模型</div>
              <div className="v"><div className="mlist">{MODELS.map(([m, d]) => (
                <button key={m} className={`mopt${settings.model === m ? ' on' : ''}`} onClick={() => update({ model: m })}>
                  <b>{MODEL_LABEL[m]}</b><span>{d}</span>
                </button>
              ))}</div></div>
            </div>
            <div className="row">
              <div className="k">思考深度</div>
              <div className="v"><div className="seg">{EFFORTS.map((e) => <button key={e} className={settings.effort === e ? 'on' : ''} onClick={() => update({ effort: e })} aria-pressed={settings.effort === e}>{EFFORT_LABEL[e]}</button>)}</div></div>
            </div>
          </div>
        </section>
      </div></div>
    </main>
  );
}
