// Backend access. Inside Tauri this calls the Rust commands; in a plain browser (design review,
// screenshots) it falls back to an in-memory store seeded with recorded lessons.
import type { LessonEvent, LessonMeta, LessonRecord, Part } from './lesson';
import type { Gen } from './settings';
import { chaptersOf, itemsOf } from './chapters';
import bubble from '../fixtures/bubble.json';
import deriv from '../fixtures/deriv.json';
import pyth from '../fixtures/pyth.json';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface Api {
  listLessons(): Promise<LessonMeta[]>;
  getLesson(id: string): Promise<LessonRecord>;
  setProgress(id: string, step: number): Promise<void>;
  startLesson(question: string, gen?: Gen): Promise<string>;
  /** a follow-up asked while reading `chapter` (0-based) */
  continueLesson(id: string, question: string, gen: Gen | undefined, chapter: number): Promise<void>;
  renameChapter(id: string, chapter: number, name: string): Promise<void>;
  cancelLesson(id: string): Promise<void>;
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
    startLesson: (question, gen) => call('start_lesson', { question, model: gen?.model, effort: gen?.effort }),
    continueLesson: (id, question, gen, chapter) => call('continue_lesson', { id, question, model: gen?.model, effort: gen?.effort, chapter }),
    renameChapter: (id, chapter, name) => call('rename_chapter', { id, chapter, name }),
    cancelLesson: (id) => call('cancel_lesson', { id }),
    claudeStatus: () => call('claude_status'),
    onLessonEvent(cb) {
      let off: (() => void) | undefined;
      let dead = false;
      event.then((m) => m.listen<LessonEvent>('lesson-event', (e) => cb(e.payload))).then((u) => (dead ? u() : (off = u)));
      return () => { dead = true; off?.(); };
    },
  };
}

/** Browser preview only: a made-up cost so the cost line has something to show. */
const PREVIEW_COST = { usd: 0.0214, input: 3, output: 2870, cacheRead: 11200, cacheWrite: 4100 };

function mockApi(): Api {
  const fixtures = [bubble, pyth, deriv] as { lesson: NonNullable<LessonRecord['lesson']>; model: string }[];
  const questions = ['泡泡排序是怎麼運作的？', '畢氏定理為什麼成立？', '導數到底在算什麼？'];
  const timers = new Map<string, number[]>();
  const now = Date.now();
  const store = new Map<string, LessonRecord>();
  fixtures.forEach((f, i) => {
    const id = `demo${i}`;
    store.set(id, { id, question: questions[i], status: 'ready', createdAt: now - (i + 1) * 3600e3, step: 0, lesson: f.lesson, model: f.model, cost: PREVIEW_COST });
  });
  const bus = new EventTarget();
  const emit = (e: LessonEvent) => bus.dispatchEvent(new CustomEvent('e', { detail: e }));
  const meta = (r: LessonRecord): LessonMeta => ({
    id: r.id, question: r.question, status: r.status, createdAt: r.createdAt, step: r.step,
    title: r.lesson?.title, subject: r.lesson?.subject,
    total: r.lesson && itemsOf(chaptersOf(r)).length,
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
      const f = /畢氏|三角|幾何|證明/i.test(question) ? fixtures[1] : /導數|斜率|微積分|函數/.test(question) ? fixtures[2] : fixtures[0];
      const { widget: _w, ...draft } = f.lesson;
      const t: number[] = [];
      t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在寫步驟…' }), 400));
      draft.steps.forEach((_, i) => t.push(window.setTimeout(() => {
        const d = { ...draft, steps: draft.steps.slice(0, i + 1) };
        store.get(id)!.draft = d;
        emit({ id, type: 'partial', lesson: d });
      }, 700 + i * 350)));
      t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在畫給你看…' }), 800 + draft.steps.length * 350));
      t.push(window.setTimeout(() => {
        Object.assign(store.get(id)!, { status: 'ready', lesson: f.lesson, model: f.model, draft: undefined, cost: PREVIEW_COST });
        timers.delete(id);
        emit({ id, type: 'ready' });
      }, 3200 + draft.steps.length * 350));
      timers.set(id, t);
      return id;
    },
    // Preview only: follow-ups take turns between a text reply and a new chapter from the fixtures.
    async continueLesson(id, question, _gen, chapter) {
      const r = store.get(id);
      if (!r || r.status !== 'ready') throw new Error('這一課還沒準備好');
      if (r.pending?.status === 'generating') throw new Error('上一個追問還在生成');
      r.pending = { question, status: 'generating', at: chapter };
      const n = r.more?.length ?? 0;
      const t: number[] = [];
      const done = (part: Part) => t.push(window.setTimeout(() => {
        r.more = [...(r.more ?? []), part];
        r.pending = undefined;
        timers.delete(id);
        emit({ id, type: 'ready' });
      }, 2400));
      t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在想怎麼教…' }), 300));
      if (n % 2 === 0) {
        const text = '好問題背後通常是同一件事：**每一步只看眼前兩個數字**。所以不用記整個排序過程，只要跟著那一對往右移就好。';
        for (let k = 1; k <= 4; k++) t.push(window.setTimeout(() => {
          r.pending!.draft = { mode: 'text', text: text.slice(0, Math.ceil((text.length * k) / 4)) };
          emit({ id, type: 'partial', lesson: r.pending!.draft, more: true });
        }, 400 + k * 350));
        done({ question, mode: 'text', at: chapter, text, suggestions: r.lesson!.suggestions, model: 'preview', cost: PREVIEW_COST });
      } else {
        const f = fixtures[(fixtures.findIndex((x) => x.lesson.title === r.lesson!.title) + 1 + n) % fixtures.length];
        const { widget: _w, ...draft } = f.lesson;
        draft.steps.forEach((_, i) => t.push(window.setTimeout(() => {
          r.pending!.draft = { mode: 'chapter', ...draft, steps: draft.steps.slice(0, i + 1) };
          emit({ id, type: 'partial', lesson: r.pending!.draft, more: true });
        }, 500 + i * 250)));
        done({ question, mode: 'chapter', lesson: f.lesson, model: f.model, cost: PREVIEW_COST });
      }
      timers.set(id, t);
    },
    async renameChapter(id, chapter, name) {
      const r = store.get(id);
      if (!r) return;
      r.names = { ...r.names };
      if (name.trim()) r.names[chapter] = name.trim(); else delete r.names[chapter];
    },
    async cancelLesson(id) {
      timers.get(id)?.forEach(clearTimeout);
      timers.delete(id);
      const r = store.get(id)!;
      if (r.pending) Object.assign(r.pending, { status: 'error', error: '你停止了這次生成' });
      else Object.assign(r, { status: 'error', error: '你停止了這次生成' });
      emit({ id, type: 'error', message: '你停止了這次生成' });
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
