// The film's backend: the app's own Api, answered from recorded lessons (data/lessons.json) with
// the same events the real sidecar sends — status lines, steps streaming in, then ready.
// The film drives it through window.promo.
import type { Api } from '@app/api';
import type { Draft, Lesson, LessonEvent, LessonMeta, LessonRecord, Part } from '@app/lesson';
import { chaptersOf, itemsOf } from '@app/chapters';
import all from '../data/lessons.json';

export const inTauri = false;

const records = all as unknown as LessonRecord[];
const byQuestion = (q: string) => records.find((r) => r.question === q);

export interface Followup { mode: 'text'; text: string; suggestions?: string[] }
export interface Timing { status: number; step: number; draw: number; reply: number }

const promo = {
  /** questions asked from the composer resolve to the recorded lesson with that question */
  timing: { status: 300, step: 380, draw: 1500, reply: 2200 } as Timing,
  followups: {} as Record<string, Followup>,
  sidebar: [] as string[],
};
(window as unknown as { promo: typeof promo & { api: Api } }).promo = promo as typeof promo & { api: Api };

const COST = (r?: LessonRecord) => r?.cost ?? { usd: 0.046, input: 2, output: 3100, cacheRead: 8400, cacheWrite: 5600 };

function makeApi(): Api {
  const store = new Map<string, LessonRecord>();
  const day = new Date(); day.setHours(9, 0, 0, 0);
  const params = new URLSearchParams(location.search);
  const side = (params.get('side') ?? '').split('|').filter(Boolean);
  side.forEach((q, i) => {
    const r = byQuestion(q);
    if (r) store.set(r.id, { ...structuredClone(r), createdAt: day.getTime() - i * 60e3, step: 0 });
  });
  const open = params.get('open');
  if (open) {
    const r = byQuestion(open);
    if (r) store.set(r.id, { ...structuredClone(r), createdAt: day.getTime() + 60e3, step: Number(params.get('step') ?? 0) });
  }
  const bus = new EventTarget();
  const emit = (e: LessonEvent) => bus.dispatchEvent(new CustomEvent('e', { detail: e }));
  const meta = (r: LessonRecord): LessonMeta => ({
    id: r.id, question: r.question, status: r.status, createdAt: r.createdAt, step: r.step,
    title: r.lesson?.title ?? r.draft?.title, subject: r.lesson?.subject ?? r.draft?.subject,
    total: r.lesson && itemsOf(chaptersOf(r)).length,
  });
  const later = (ms: number, f: () => void) => window.setTimeout(f, ms);

  return {
    async listLessons() { return [...store.values()].sort((a, b) => b.createdAt - a.createdAt).map(meta); },
    async getLesson(id) {
      const r = store.get(id);
      if (!r) throw new Error(`no lesson ${id}`);
      return structuredClone(r);
    },
    async setProgress(id, step) { const r = store.get(id); if (r) r.step = step; },
    async startLesson(question) {
      const src = byQuestion(question);
      if (!src?.lesson) throw new Error(`no recorded lesson for ${question}`);
      const id = `${src.id}-live`;
      const T = promo.timing;
      store.set(id, { id, question, status: 'generating', createdAt: Date.now(), step: 0 });
      const { widget: _w, ...rest } = src.lesson;
      later(T.status, () => emit({ id, type: 'status', text: '正在寫步驟…' }));
      const head: Draft = { title: rest.title, subject: rest.subject, crumbs: rest.crumbs };
      rest.steps.forEach((_, i) => later(T.status + 400 + i * T.step, () => {
        const d: Draft = { ...head, steps: rest.steps.slice(0, i + 1) };
        store.get(id)!.draft = d;
        emit({ id, type: 'partial', lesson: d });
      }));
      const drawAt = T.status + 400 + rest.steps.length * T.step;
      later(drawAt, () => emit({ id, type: 'status', text: '正在畫給你看…' }));
      later(drawAt + T.draw, () => {
        Object.assign(store.get(id)!, { status: 'ready', lesson: structuredClone(src.lesson as Lesson), model: 'sonnet', draft: undefined, cost: COST(src) });
        emit({ id, type: 'ready' });
      });
      return id;
    },
    async continueLesson(id, question, _gen, chapter) {
      const r = store.get(id);
      if (!r || r.status !== 'ready') throw new Error('這一課還沒準備好');
      const f = promo.followups[question];
      if (!f) throw new Error(`no scripted follow-up for ${question}`);
      r.pending = { question, status: 'generating', at: chapter };
      const T = promo.timing;
      later(T.status, () => emit({ id, type: 'status', text: '正在想怎麼教…' }));
      const n = 8;
      for (let k = 1; k <= n; k++) later(T.status + 200 + (k * T.reply) / n, () => {
        r.pending!.draft = { mode: 'text', text: f.text.slice(0, Math.ceil((f.text.length * k) / n)) };
        emit({ id, type: 'partial', lesson: r.pending!.draft, more: true });
      });
      later(T.status + 500 + T.reply, () => {
        const part: Part = { question, mode: 'text', at: chapter, text: f.text, suggestions: f.suggestions ?? r.lesson!.suggestions, model: 'sonnet', cost: { usd: 0.012, input: 2, output: 600, cacheRead: 14000, cacheWrite: 900 } };
        r.more = [...(r.more ?? []), part];
        r.pending = undefined;
        emit({ id, type: 'ready' });
      });
    },
    async answerLesson() {},
    async continueCourse() {},
    async renameChapter() {},
    async deleteLesson(id) { store.delete(id); },
    async cancelLesson() {},
    async claudeStatus() { return 'ok'; },
    async openLink() {},
    onLessonEvent(cb) {
      const h = (e: Event) => cb((e as CustomEvent<LessonEvent>).detail);
      bus.addEventListener('e', h);
      return () => bus.removeEventListener('e', h);
    },
  };
}

export const api: Api = makeApi();
(window as unknown as { promo: { api: Api } }).promo.api = api;
