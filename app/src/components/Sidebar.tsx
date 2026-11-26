import { Icon, Mark, subjectIcon } from '../icons';
import type { LessonMeta } from '../lesson';
import type { View } from '../App';

const DAY = 86400e3;

function groups(lessons: LessonMeta[]) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const out: [string, LessonMeta[]][] = [['今天', []], ['本週', []], ['更早', []]];
  for (const l of lessons) out[l.createdAt >= today ? 0 : l.createdAt >= today - 6 * DAY ? 1 : 2][1].push(l);
  return out.filter(([, ls]) => ls.length);
}

export function Sidebar({ lessons, view, go, claude }: {
  lessons: LessonMeta[]; view: View; go: (v: View) => void; claude: { ok: boolean; text: string };
}) {
  const active = view.name === 'lesson' ? view.id : '';
  return (
    <aside className="side">
      <div className="ws"><Mark /><b>Unfold</b></div>
      <button className={`newb${view.name === 'home' ? ' on' : ''}`} onClick={() => go({ name: 'home' })}>
        <Icon.plus />新的課<span className="kbd">Ctrl N</span>
      </button>
      <nav className="side-list">
        {groups(lessons).map(([label, ls]) => (
          <div key={label}>
            <div className="grp">{label}</div>
            {ls.map((l) => (
              <button key={l.id} className={`item${active === l.id ? ' on' : ''}${l.status === 'error' ? ' err' : ''}`} onClick={(e) => { e.currentTarget.blur(); go({ name: 'lesson', id: l.id }); }} title={l.question}>
                {subjectIcon(l.subject)}
                <span>{l.title ?? l.question}</span>
                {l.status === 'generating' && <i className="livedot" title="生成中" />}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <button className={`me${view.name === 'settings' ? ' on' : ''}`} onClick={() => go({ name: 'settings' })}>
        <span className="av"><Icon.gear /></span>
        <span className="me-t"><span>設定</span><span className={`st${claude.ok ? '' : ' bad'}`}><i />{claude.text}</span></span>
      </button>
    </aside>
  );
}
