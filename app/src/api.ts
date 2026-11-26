// Backend access. Inside Tauri this calls the Rust commands; in a plain browser (design review,
// screenshots) it falls back to an in-memory store seeded with recorded lessons.
import type { LessonEvent, LessonMeta, LessonRecord } from './lesson';
import bubble from '../fixtures/bubble.json';
import pyth from '../fixtures/pyth.json';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface Api {
  listLessons(): Promise<LessonMeta[]>;
  getLesson(id: string): Promise<LessonRecord>;
  setProgress(id: string, step: number): Promise<void>;
  startLesson(question: string, model?: string, context?: string): Promise<string>;
  claudeStatus(): Promise<string>;
  onLessonEvent(cb: (e: LessonEvent) => void): () => void;
}

function tauriApi(): Api {
  const core = import('@tauri-apps/api/core');
  const event = import('@tauri-apps/api/event');
  const call = async <T,>(cmd: string, args?: Record<string, unknown>) => (await core).invoke<T>(cmd, args);
  return {
    listLessons: () => call('list_lessons'),
    getLesson: (id) => call('get_lesson', { id }),
    setProgress: (id, step) => call('set_progress', { id, step }),
    startLesson: (question, model, context) => call('start_lesson', { question, model, context }),
    claudeStatus: () => call('claude_status'),
    onLessonEvent(cb) {
      let off: (() => void) | undefined;
      let dead = false;
      event.then((m) => m.listen<LessonEvent>('lesson-event', (e) => cb(e.payload))).then((u) => (dead ? u() : (off = u)));
      return () => { dead = true; off?.(); };
    },
  };
}

function mockApi(): Api {
  const fixtures = [bubble, pyth] as { lesson: LessonRecord['lesson']; model: string }[];
  const now = Date.now();
  const store = new Map<string, LessonRecord>();
  fixtures.forEach((f, i) => {
    const id = `demo${i}`;
    store.set(id, { id, question: i ? '畢氏定理為什麼成立？' : '泡泡排序是怎麼運作的？', status: 'ready', createdAt: now - (i + 1) * 3600e3, step: 0, lesson: f.lesson, model: f.model });
  });
  const bus = new EventTarget();
  const emit = (e: LessonEvent) => bus.dispatchEvent(new CustomEvent('e', { detail: e }));
  const meta = (r: LessonRecord): LessonMeta => ({
    id: r.id, question: r.question, status: r.status, createdAt: r.createdAt, step: r.step,
    title: r.lesson?.title, subject: r.lesson?.subject, total: r.lesson?.steps.length,
  });
  return {
    async listLessons() { return [...store.values()].sort((a, b) => b.createdAt - a.createdAt).map(meta); },
    async getLesson(id) {
      const r = store.get(id);
      if (!r) throw new Error(`no lesson ${id}`);
      return structuredClone(r);
    },
    async setProgress(id, step) { const r = store.get(id); if (r) r.step = step; },
    async startLesson(question) {
      const id = `m${Date.now().toString(36)}`;
      store.set(id, { id, question, status: 'generating', createdAt: Date.now(), step: 0 });
      setTimeout(() => emit({ id, type: 'status', text: '正在想怎麼畫給你看…' }), 600);
      setTimeout(() => {
        const f = /畢氏|三角|幾何|math|證明/i.test(question) ? fixtures[1] : fixtures[0];
        Object.assign(store.get(id)!, { status: 'ready', lesson: f.lesson, model: f.model });
        emit({ id, type: 'ready' });
      }, 2400);
      return id;
    },
    async claudeStatus() { return 'preview'; },
    onLessonEvent(cb) {
      const h = (e: Event) => cb((e as CustomEvent<LessonEvent>).detail);
      bus.addEventListener('e', h);
      return () => bus.removeEventListener('e', h);
    },
  };
}

export const api: Api = inTauri ? tauriApi() : mockApi();
