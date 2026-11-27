// Backend access. Inside Tauri this calls the Rust commands; in a plain browser (design review,
// screenshots) it falls back to an in-memory store seeded with recorded lessons.
import type { Answer, LessonEvent, LessonMeta, LessonRecord, Part } from './lesson';
import type { Gen } from './settings';
import { chaptersOf, courseWritten, itemsOf } from './chapters';
import bubble from '../fixtures/bubble.json';
import deriv from '../fixtures/deriv.json';
import pyth from '../fixtures/pyth.json';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface Api {
  listLessons(): Promise<LessonMeta[]>;
  getLesson(id: string): Promise<LessonRecord>;
  setProgress(id: string, step: number): Promise<void>;
  /** askFirst: the learner wants Claude to ask before teaching */
  startLesson(question: string, gen?: Gen, askFirst?: boolean): Promise<string>;
  /** answers to the questions Claude asked; an empty list skips them */
  answerLesson(id: string, answers: Answer[], gen: Gen | undefined): Promise<void>;
  /** writes the rest of a course after a chapter failed or was stopped */
  continueCourse(id: string, gen: Gen | undefined): Promise<void>;
  /** a follow-up asked while reading `chapter` (0-based) */
  continueLesson(id: string, question: string, gen: Gen | undefined, chapter: number): Promise<void>;
  renameChapter(id: string, chapter: number, name: string): Promise<void>;
  cancelLesson(id: string): Promise<void>;
  claudeStatus(): Promise<string>;
  openLink(url: string): Promise<void>;
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
    startLesson: (question, gen, askFirst) => call('start_lesson', { question, model: gen?.model, effort: gen?.effort, askFirst }),
    answerLesson: (id, answers, gen) => call('answer_lesson', { id, answers, model: gen?.model, effort: gen?.effort }),
    continueCourse: (id, gen) => call('continue_course', { id, model: gen?.model, effort: gen?.effort }),
    continueLesson: (id, question, gen, chapter) => call('continue_lesson', { id, question, model: gen?.model, effort: gen?.effort, chapter }),
    renameChapter: (id, chapter, name) => call('rename_chapter', { id, chapter, name }),
    cancelLesson: (id) => call('cancel_lesson', { id }),
    claudeStatus: () => call('claude_status'),
    openLink: (url) => call('open_link', { url }),
    onLessonEvent(cb) {
      let off: (() => void) | undefined;
      let dead = false;
      event.then((m) => m.listen<LessonEvent>('lesson-event', (e) => cb(e.payload))).then((u) => (dead ? u() : (off = u)));
      return () => { dead = true; off?.(); };
    },
  };
}

/** Browser preview only: the questions a broad question gets before the lesson. */
const PREVIEW_ASK = {
  text: '開始之前想先確認兩件事，讓這堂課剛好是你要的。',
  questions: [
    { id: 'scope', text: '你想學到多完整？', options: ['只要弄懂一個重點', '一整課，分幾章從頭教'] },
    { id: 'how', text: '怎麼呈現比較好懂？', options: ['看它動起來', '跟著例題一步步算', '整理比較表'], multi: true },
    { id: 'level', text: '你現在的程度？', options: ['第一次學', '學過但不太懂', '準備考試'] },
  ],
};

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
    title: r.course?.title ?? r.lesson?.title, subject: r.lesson?.subject,
    total: r.lesson && itemsOf(chaptersOf(r)).length,
  });
  const pickFixture = (q: string) => /畢氏|三角|幾何|證明/i.test(q) ? fixtures[1] : /導數|斜率|微積分|函數/.test(q) ? fixtures[2] : fixtures[0];
  /**
   * Streams a fixture's steps from `at` ms on, as the lesson's first chapter or (with `part`) as a
   * chapter in the lesson's pending slot; returns when it lands.
   */
  const playChapter = (id: string, f: typeof fixtures[number], t: number[], at: number, part?: Omit<Part, 'lesson'>, next?: string) => {
    const r = store.get(id)!;
    const { widget: _w, ...draft } = f.lesson;
    t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在寫步驟…' }), at + 400));
    draft.steps.forEach((_, i) => t.push(window.setTimeout(() => {
      const d = { mode: 'chapter' as const, ...draft, steps: draft.steps.slice(0, i + 1) };
      if (part) r.pending!.draft = d; else r.draft = d;
      emit({ id, type: 'partial', lesson: d, more: !!part });
    }, at + 700 + i * 300)));
    const end = at + 2400 + draft.steps.length * 300;
    t.push(window.setTimeout(() => {
      if (part) { r.more = [...(r.more ?? []), { ...part, lesson: f.lesson, model: f.model, cost: PREVIEW_COST }]; r.pending = undefined; }
      else Object.assign(r, { status: 'ready', lesson: f.lesson, model: f.model, draft: undefined, cost: PREVIEW_COST });
      if (next) r.pending = { question: next, status: 'generating', course: true };
      emit({ id, type: 'ready' });
    }, end));
    return end;
  };
  /** Writes the preview course's chapters from `k` on, one after another. */
  const writeCourse = (id: string, k: number, t: number[], at: number) => {
    const goal = (n: number) => `弄懂${fixtures[n].lesson.title.split('：')[0]}在做什麼`;
    for (let n = k; n < fixtures.length; n++) {
      const next = n + 1 < fixtures.length ? goal(n + 1) : undefined;
      const part = n > 0 ? { question: goal(n), mode: 'chapter' as const, course: true, suggestions: fixtures[n].lesson.suggestions } : undefined;
      at = playChapter(id, fixtures[n], t, at, part, next) + 100;
    }
    t.push(window.setTimeout(() => timers.delete(id), at));
  };
  return {
    async listLessons() { return [...store.values()].sort((a, b) => b.createdAt - a.createdAt).map(meta); },
    async getLesson(id) {
      const r = store.get(id);
      if (!r) throw new Error(`no lesson ${id}`);
      return structuredClone(r);
    },
    async setProgress(id, step) { const r = store.get(id); if (r) r.step = step; },
    async startLesson(question, _gen, askFirst) {
      const id = `m${Date.now().toString(36)}`;
      store.set(id, { id, question, status: 'generating', createdAt: Date.now(), step: 0 });
      const t: number[] = [];
      timers.set(id, t);
      // Preview only: broad questions (or 先問我) get questions first, like Claude would ask.
      if (askFirst || question.length <= 6 || /整課|一整|全部|單元/.test(question)) {
        t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在想要先問你什麼…' }), 300));
        t.push(window.setTimeout(() => {
          Object.assign(store.get(id)!, { status: 'asking', ask: PREVIEW_ASK, model: 'preview', cost: PREVIEW_COST });
          timers.delete(id);
          emit({ id, type: 'ready' });
        }, 1400));
        return id;
      }
      playChapter(id, pickFixture(question), t, 0);
      return id;
    },
    async answerLesson(id, answers) {
      const r = store.get(id);
      if (!r || r.status !== 'asking') throw new Error('這一課沒有在等你回答');
      Object.assign(r, { status: 'generating', answers });
      const t: number[] = [];
      timers.set(id, t);
      if (!answers.some((a) => a.answer.includes('一整課'))) { playChapter(id, pickFixture(r.question), t, 0); return; }
      const course = { title: `${r.question}：整課`, outline: fixtures.map((f) => ({ title: f.lesson.title.split('：')[0], goal: `弄懂${f.lesson.title.split('：')[0]}在做什麼` })) };
      t.push(window.setTimeout(() => emit({ id, type: 'status', text: '正在規劃整課…' }), 200));
      t.push(window.setTimeout(() => { r.course = course; emit({ id, type: 'ready' }); }, 900));
      writeCourse(id, 0, t, 1000);
    },
    async continueCourse(id) {
      const r = store.get(id);
      if (!r?.course) throw new Error('這一課沒有要接著寫的章節');
      const k = courseWritten(r);
      r.pending = { question: r.course.outline[k].goal, status: 'generating', course: true };
      const t: number[] = [];
      timers.set(id, t);
      writeCourse(id, k, t, 100);
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
    async openLink(url) { open(url, '_blank', 'noopener'); },
    onLessonEvent(cb) {
      const h = (e: Event) => cb((e as CustomEvent<LessonEvent>).detail);
      bus.addEventListener('e', h);
      return () => bus.removeEventListener('e', h);
    },
  };
}

export const api: Api = inTauri ? tauriApi() : mockApi();
