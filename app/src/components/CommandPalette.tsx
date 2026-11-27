import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon, subjectIcon } from '../icons';
import { SUBJECT_LABEL, type LessonMeta } from '../lesson';
import type { Accent, Settings } from '../settings';
import type { View } from '../App';

interface Entry {
  id: string;
  group: '課程' | '動作' | '外觀';
  label: string;
  meta?: string;
  kbd?: string;
  icon: ReactNode;
  run: () => void;
  keywords: string;
}

const ACCENTS: [Accent, string][] = [['orange', '橘'], ['teal', '青'], ['coral', '珊瑚'], ['mono', '石板']];

export function CommandPalette({ open, onClose, lessons, settings, update, go, onShowShortcuts }: {
  open: boolean;
  onClose: () => void;
  lessons: LessonMeta[];
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  go: (v: View) => void;
  onShowShortcuts: () => void;
}) {
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIdx(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const lessonEntries: Entry[] = lessons.map((l) => {
      const status =
        l.status === 'generating' ? '生成中'
        : l.status === 'asking' ? '等你回答'
        : l.status === 'error' ? '未完成'
        : l.total && l.step >= l.total - 1 ? '已學完'
        : l.total ? `${l.step + 1} / ${l.total}` : undefined;
      const subj = l.subject ? SUBJECT_LABEL[l.subject] : '';
      return {
        id: `l:${l.id}`,
        group: '課程',
        label: l.title ?? l.question,
        meta: status,
        icon: subjectIcon(l.subject),
        keywords: `${l.title ?? ''} ${l.question} ${subj}`.toLowerCase(),
        run: () => { go({ name: 'lesson', id: l.id }); onClose(); },
      };
    });

    const isDark = document.documentElement.dataset.theme === 'dark';
    const actions: Entry[] = [
      {
        id: 'a:new', group: '動作', label: '開始一堂新課', kbd: 'Ctrl N', icon: <Icon.plus />,
        keywords: 'new lesson 新課 首頁 home',
        run: () => { go({ name: 'home' }); onClose(); },
      },
      {
        id: 'a:side', group: '動作', label: settings.sidebarOpen ? '收合側邊欄' : '展開側邊欄', kbd: 'Ctrl B', icon: <Icon.sidebar />,
        keywords: 'sidebar 側邊欄 專注 focus',
        run: () => { update({ sidebarOpen: !settings.sidebarOpen }); onClose(); },
      },
      {
        id: 'a:keys', group: '動作', label: '檢視鍵盤快捷鍵', kbd: '?', icon: <Icon.keyboard />,
        keywords: 'shortcuts keyboard 快捷鍵 鍵盤',
        run: () => { onClose(); onShowShortcuts(); },
      },
      {
        id: 'a:settings', group: '動作', label: '開啟設定', kbd: 'Ctrl ,', icon: <Icon.gear />,
        keywords: 'settings preferences 設定',
        run: () => { go({ name: 'settings' }); onClose(); },
      },
      {
        id: 't:theme', group: '外觀', label: isDark ? '切換為淺色主題' : '切換為深色主題', icon: isDark ? <Icon.sun /> : <Icon.moon />,
        keywords: 'theme dark light 深色 淺色 主題',
        run: () => { update({ theme: isDark ? 'light' : 'dark' }); onClose(); },
      },
      ...ACCENTS.filter(([a]) => a !== settings.accent).map(([a, name]): Entry => ({
        id: `t:acc:${a}`, group: '外觀', label: `強調色改為「${name}」`, icon: <span className={`acc-dot ${a}`} />,
        keywords: `accent color 強調色 顏色 ${name} ${a}`,
        run: () => { update({ accent: a }); onClose(); },
      })),
    ];

    const q = query.trim().toLowerCase();
    const all = [...lessonEntries, ...actions];
    if (!q) return all;
    const terms = q.split(/\s+/);
    return all.filter((e) => terms.every((t) => e.keywords.includes(t) || e.label.toLowerCase().includes(t)));
  }, [go, lessons, onClose, onShowShortcuts, query, settings.accent, settings.sidebarOpen, update]);

  useEffect(() => { setIdx(0); }, [query]);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('.cmd-it.on');
    active?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  if (!open) return null;

  const grouped: [Entry['group'], Entry[]][] = [];
  for (const e of entries) {
    const last = grouped[grouped.length - 1];
    if (last && last[0] === e.group) last[1].push(e);
    else grouped.push([e.group, [e]]);
  }

  let flatIndex = 0;

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="快速搜尋與指令">
        <div className="cmd-head">
          <Icon.search />
          <input
            ref={inputRef} value={query} placeholder="搜尋課程、科目或操作…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => (entries.length ? (i + 1) % entries.length : 0)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0)); }
              else if (e.key === 'Enter' && !e.nativeEvent.isComposing && entries[idx]) { e.preventDefault(); entries[idx].run(); }
            }}
          />
          <kbd className="cmd-esc">Esc</kbd>
        </div>
        <div className="cmd-list" ref={listRef}>
          {entries.length === 0 && <div className="cmd-empty">找不到符合「{query}」的項目</div>}
          {grouped.map(([group, items]) => (
            <div key={group} className="cmd-grp">
              <div className="cmd-gt">{group}</div>
              {items.map((item) => {
                const i = flatIndex++;
                return (
                  <button
                    key={item.id} type="button" className={`cmd-it${i === idx ? ' on' : ''}`}
                    onMouseEnter={() => setIdx(i)}
                    onClick={item.run}
                  >
                    <span className="cmd-ic">{item.icon}</span>
                    <span className="cmd-lb">{item.label}</span>
                    {item.meta && <span className="cmd-meta tnum">{item.meta}</span>}
                    {item.kbd && <kbd className="cmd-kbd">{item.kbd}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
