import { useMemo, useState } from 'react';
import { Icon, Mark, subjectIcon } from '../icons';
import { SUBJECT_LABEL, type LessonMeta } from '../lesson';
import type { View } from '../App';

const DAY = 86400e3;

function groups(lessons: LessonMeta[]) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const out: [string, LessonMeta[]][] = [['今天', []], ['本週', []], ['更早', []]];
  for (const l of lessons) out[l.createdAt >= today ? 0 : l.createdAt >= today - 6 * DAY ? 1 : 2][1].push(l);
  return out.filter(([, ls]) => ls.length);
}

export function Sidebar({ lessons, view, go, claude, onDelete, onSearch, collapsed }: {
  lessons: LessonMeta[];
  view: View;
  go: (v: View) => void;
  claude: { ok: boolean; text: string };
  onDelete?: (id: string) => void;
  onSearch?: () => void;
  collapsed?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const active = view.name === 'lesson' ? view.id : '';

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((l) => {
      const subj = l.subject ? SUBJECT_LABEL[l.subject] : '';
      return (l.title ?? '').toLowerCase().includes(q)
        || l.question.toLowerCase().includes(q)
        || subj.includes(q);
    });
  }, [lessons, filter]);

  const grouped = useMemo(() => groups(shown), [shown]);

  return (
    <aside className={`side${collapsed ? ' collapsed' : ''}`} aria-hidden={collapsed || undefined}>
      <div className="ws">
        <Mark /><b>Unfold</b>
        {onSearch && (
          <button type="button" className="ws-k" onClick={onSearch} title="搜尋與指令（Ctrl K）" aria-label="搜尋與指令">
            <Icon.search /><span className="kbd">Ctrl K</span>
          </button>
        )}
      </div>
      <button type="button" className={`newb${view.name === 'home' ? ' on' : ''}`} onClick={() => go({ name: 'home' })}>
        <Icon.plus />問一問<span className="kbd">Ctrl N</span>
      </button>
      {lessons.length > 4 && (
        <div className="side-find">
          <Icon.search />
          <input
            value={filter} placeholder="篩選課程…" aria-label="篩選課程"
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setFilter(''); e.currentTarget.blur(); } }}
          />
          {filter && <button type="button" className="sf-x" onClick={() => setFilter('')} aria-label="清除篩選"><Icon.x /></button>}
        </div>
      )}
      <nav className="side-list" aria-label="課程列表">
        {lessons.length === 0 ? (
          <div className="side-empty">問一個問題就會出現在這裡</div>
        ) : grouped.length === 0 ? (
          <div className="side-empty">找不到符合的課程</div>
        ) : (
          grouped.map(([label, ls]) => (
            <div key={label}>
              <div className="grp">{label}</div>
              {ls.map((l) => {
                const done = l.status === 'ready' && !!l.total && l.step >= l.total - 1;
                const pct = l.status === 'ready' && l.total && l.step > 0 && !done
                  ? Math.round(((l.step + 1) / l.total) * 100) : 0;
                const confirming = confirmId === l.id;
                return (
                  <div key={l.id} className={`item-w${confirming ? ' confirming' : ''}`} onMouseLeave={() => { if (confirming) setConfirmId(null); }}>
                    {confirming ? (
                      <div className="item-cfm">
                        <span>刪除這堂課？</span>
                        <button type="button" className="cfm-y" onClick={() => { setConfirmId(null); onDelete?.(l.id); }}>刪除</button>
                        <button type="button" className="cfm-n" onClick={() => setConfirmId(null)}>取消</button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`item${active === l.id ? ' on' : ''}${l.status === 'error' ? ' err' : ''}`}
                          onClick={(e) => { e.currentTarget.blur(); go({ name: 'lesson', id: l.id }); }}
                          title={l.question}
                        >
                          {subjectIcon(l.subject)}
                          <span className="it-lbl">{l.title ?? l.question}</span>
                          {l.status === 'generating' && <i className="livedot" title="生成中" />}
                          {l.status === 'asking' && <i className="askdot" title="等你回答" />}
                          {l.status === 'error' && <i className="errdot" title="沒有生成成功" />}
                          {done && <span className="donedot" title="已學完"><Icon.check /></span>}
                          {pct > 0 && <span className="it-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>}
                        </button>
                        {onDelete && (
                          <button
                            type="button" className="it-del"
                            onClick={(e) => { e.stopPropagation(); setConfirmId(l.id); }}
                            aria-label={`刪除「${l.title ?? l.question}」`} title="刪除這堂課"
                          >
                            <Icon.trash />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </nav>
      <button type="button" className={`me${view.name === 'settings' ? ' on' : ''}`} onClick={() => go({ name: 'settings' })}>
        <span className="av"><Icon.gear /></span>
        <span className="me-t"><span>設定</span><span className={`st${claude.ok ? '' : ' bad'}`}><i />{claude.text}</span></span>
      </button>
    </aside>
  );
}
