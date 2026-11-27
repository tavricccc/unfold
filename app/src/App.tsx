import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { LessonMeta } from './lesson';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { ToastStack, type ToastItem } from './components/Toast';
import { genOf, useSettings } from './settings';
import { Home } from './views/Home';
import { LessonView } from './views/LessonView';
import { SettingsView } from './views/SettingsView';

export type View = { name: 'home' } | { name: 'lesson'; id: string } | { name: 'settings' };

export default function App() {
  const [settings, update] = useSettings();
  const [view, setView] = useState<View>({ name: 'home' });
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [claude, setClaude] = useState({ ok: true, text: '檢查 Claude Code…' });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const toastSeq = useRef(1);

  const notify = useCallback((text: string, tone: ToastItem['tone'] = 'info', action?: ToastItem['action'], sticky?: boolean) => {
    const id = toastSeq.current++;
    setToasts((list) => [...list.slice(-2), { id, text, tone, action, sticky }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const refresh = useCallback(() => {
    api.listLessons().then(setLessons, (e) => notify(`讀不到課程：${e}`, 'err'));
  }, [notify]);

  const checkClaude = useCallback(async () => {
    try {
      const v = await api.claudeStatus();
      setClaude({ ok: true, text: v === 'preview' ? '瀏覽器預覽' : 'Claude Code 已連線' });
    } catch {
      setClaude({ ok: false, text: '找不到 Claude Code' });
    }
  }, []);

  useEffect(() => {
    refresh();
    checkClaude();
    return api.onLessonEvent((e) => { if (e.type !== 'status') refresh(); });
  }, [refresh, checkClaude]);

  useEffect(() => {
    api.checkUpdate().then((u) => {
      if (!u) return;
      notify(`有新版本 ${u.version}`, 'info', {
        label: '更新並重新啟動',
        onClick: () => {
          notify(`正在下載 ${u.version}…`, 'info', undefined, true);
          u.install().catch((e) => notify(`更新失敗：${e}`, 'err'));
        },
      }, true);
    }, (e) => console.warn('update check failed', e));
  }, [notify]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'n') { e.preventDefault(); setCmdOpen(false); setKeysOpen(false); setView({ name: 'home' }); return; }
      if (mod && k === 'k') { e.preventDefault(); setKeysOpen(false); setCmdOpen((v) => !v); return; }
      if (mod && k === 'b') { e.preventDefault(); update({ sidebarOpen: !settings.sidebarOpen }); return; }
      if (mod && e.key === ',') { e.preventDefault(); setCmdOpen(false); setKeysOpen(false); setView({ name: 'settings' }); return; }
      if (mod && e.key === '/') { e.preventDefault(); setCmdOpen(false); setKeysOpen((v) => !v); return; }
      if (!mod && !e.altKey && e.key === '?') {
        const t = e.target as HTMLElement;
        if (!t.closest('textarea, input, select, [contenteditable]')) {
          e.preventDefault();
          setCmdOpen(false);
          setKeysOpen((v) => !v);
        }
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [settings.sidebarOpen, update]);

  const ask = async (question: string, refs?: string[]) => {
    try {
      const id = await api.startLesson(question, genOf(settings), settings.askFirst, refs);
      refresh();
      setView({ name: 'lesson', id });
    } catch (e) {
      notify(`沒辦法開始這一課：${e}`, 'err');
    }
  };

  const deleteLesson = async (id: string) => {
    try {
      await api.cancelLesson(id).catch(() => {});
      await api.deleteLesson(id);
      if (view.name === 'lesson' && view.id === id) setView({ name: 'home' });
      refresh();
      notify('已刪除課程', 'ok');
    } catch (e) {
      notify(`沒辦法刪除課程：${e}`, 'err');
    }
  };

  return (
    <div className={`app${settings.sidebarOpen ? '' : ' side-off'}`}>
      <TitleBar sidebarOpen={settings.sidebarOpen} onToggleSidebar={() => update({ sidebarOpen: !settings.sidebarOpen })} />
      <Sidebar
        lessons={lessons} view={view} go={setView} claude={claude}
        onDelete={deleteLesson} onSearch={() => setCmdOpen(true)} collapsed={!settings.sidebarOpen}
      />
      {view.name === 'home' && (
        <Home lessons={lessons} settings={settings} update={update} onAsk={ask} open={(id) => setView({ name: 'lesson', id })} onError={(m) => notify(m, 'err')} claude={claude} onRecheck={checkClaude} />
      )}
      {view.name === 'lesson' && (
        <LessonView
          key={view.id} id={view.id} gen={genOf(settings)} settings={settings} update={update}
          onAsk={ask} onProgress={refresh} onDelete={deleteLesson} onHome={() => setView({ name: 'home' })}
        />
      )}
      {view.name === 'settings' && (
        <SettingsView
          settings={settings} update={update} claude={claude}
          onRecheck={checkClaude} onShowShortcuts={() => setKeysOpen(true)}
        />
      )}
      <CommandPalette
        open={cmdOpen} onClose={() => setCmdOpen(false)} lessons={lessons}
        settings={settings} update={update} go={setView} onShowShortcuts={() => setKeysOpen(true)}
      />
      <ShortcutsModal open={keysOpen} onClose={() => setKeysOpen(false)} />
      <ToastStack items={toasts} dismiss={dismissToast} />
    </div>
  );
}
