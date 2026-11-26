import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { LessonMeta } from './lesson';
import { genOf, useSettings } from './settings';
import { Sidebar } from './components/Sidebar';
import { Home } from './views/Home';
import { LessonView } from './views/LessonView';
import { SettingsView } from './views/SettingsView';

export type View = { name: 'home' } | { name: 'lesson'; id: string } | { name: 'settings' };

export default function App() {
  const [settings, update] = useSettings();
  const [view, setView] = useState<View>({ name: 'home' });
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const [claude, setClaude] = useState({ ok: true, text: '檢查 Claude Code…' });
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    api.listLessons().then(setLessons, (e) => setError(`讀不到課程：${e}`));
  }, []);

  useEffect(() => {
    refresh();
    api.claudeStatus().then(
      (v) => setClaude({ ok: true, text: v === 'preview' ? '瀏覽器預覽' : 'Claude Code 已連線' }),
      () => setClaude({ ok: false, text: '找不到 Claude Code' }),
    );
    return api.onLessonEvent((e) => { if (e.type !== 'status') refresh(); });
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setView({ name: 'home' }); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const ask = async (question: string) => {
    try {
      const id = await api.startLesson(question, genOf(settings));
      refresh();
      setView({ name: 'lesson', id });
    } catch (e) {
      setError(`沒辦法開始這一課：${e}`);
    }
  };

  return (
    <div className="app">
      <Sidebar lessons={lessons} view={view} go={setView} claude={claude} />
      {view.name === 'home' && <Home lessons={lessons} gen={genOf(settings)} onAsk={(q) => ask(q)} open={(id) => setView({ name: 'lesson', id })} />}
      {view.name === 'lesson' && <LessonView key={view.id} id={view.id} gen={genOf(settings)} onAsk={ask} onProgress={refresh} />}
      {view.name === 'settings' && <SettingsView settings={settings} update={update} claude={claude} />}
      {error && <div className="toast" role="alert" onClick={() => setError('')}>{error}</div>}
    </div>
  );
}
