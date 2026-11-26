// One running copy of the app inside the film. ?mode=app is the whole app from its home page;
// ?mode=lesson opens one lesson straight away (the montage tiles). Theme and accent come from the URL.
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@app/fonts/fonts.css';
import '@app/styles.css';
import './app-frame.css';
import App from '@app/App';
import { TitleBar } from '@app/components/TitleBar';
import { Sidebar } from '@app/components/Sidebar';
import { LessonView } from '@app/views/LessonView';
import { genOf, useSettings } from '@app/settings';
import type { LessonMeta } from '@app/lesson';
import { api } from './promo-api';

const q = new URLSearchParams(location.search);
localStorage.setItem('unfold.settings', JSON.stringify({ theme: q.get('theme') ?? 'light', accent: q.get('accent') ?? 'orange', model: 'sonnet', effort: 'low' }));

const w = window as unknown as { promo: Record<string, unknown> };
w.promo.key = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
w.promo.theme = (t: string) => { document.documentElement.dataset.theme = t; };

function LessonShell() {
  const [settings] = useSettings();
  const [lessons, setLessons] = useState<LessonMeta[]>([]);
  const refresh = () => { api.listLessons().then(setLessons); };
  useEffect(refresh, []);
  const open = lessons.find((l) => l.question === q.get('open'));
  return (
    <div className="app">
      <TitleBar />
      <Sidebar lessons={lessons} view={open ? { name: 'lesson', id: open.id } : { name: 'home' }} go={() => {}} claude={{ ok: true, text: 'Claude Code 已連線' }} />
      {open && <LessonView key={open.id} id={open.id} gen={genOf(settings)} onAsk={() => {}} onProgress={refresh} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode>{q.get('mode') === 'lesson' ? <LessonShell /> : <App />}</StrictMode>);
