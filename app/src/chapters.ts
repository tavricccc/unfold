// How a stored lesson reads as chapters. Shared by the app (what it shows) and the sidecar (what it
// tells Claude about earlier chapters), so both see the same numbering and the same current visuals.
import type { Board, Draft, Lesson, LessonRecord, Part, Step, Widget } from './lesson';

/** One thing the learner reads in order: a step that drives the visual, or a text-only reply. */
export interface Item {
  kind: 'step' | 'text';
  text: string;
  /** the chapter it belongs to */
  chapter: number;
  /** the chapter step it shows (an index into Chapter.steps) */
  local: number;
  /** which version of the chapter's visuals it shows */
  version: number;
  /** the part (0 = the lesson, then each follow-up) that wrote it */
  part: number;
  /** set on the first item of a follow-up: the question it answers */
  asked?: string;
  /** set on the last item of an answer: the reference files read to write it */
  sources?: string[];
  /** index among all items */
  i: number;
}

export interface Chapter {
  /** shown title: the learner's rename, else the one Claude wrote */
  title: string;
  /** the title Claude wrote */
  written: string;
  /** the question that opened the chapter (a planned course chapter: its goal) */
  question: string;
  /** one of the course's planned chapters, not opened by a question */
  planned?: boolean;
  /** still being written: only the steps finished so far, played while the rest arrives */
  live?: boolean;
  /**
   * every visual the chapter has had, oldest first: each scene a step opens, and each edit of one
   * (an edited scene replaces it for the steps after the edit)
   */
  versions: Widget[];
  /** per version: the chapter step its own step 0 is (scenes number their steps from their first) */
  from: number[];
  /** every step, in order (follow-ups that continue append here) */
  steps: Step[];
  /** per step: what to try, as of that step */
  tasks: string[];
  /** per step: the board beside the visual, as of that step */
  boards: (Board | undefined)[];
  items: Item[];
}

/** One version's visual and the steps it plays, numbered from its own step 0. */
export function sceneOf(ch: Chapter, version: number): { widget: Widget; steps: Step[] } {
  const from = ch.from[version];
  const end = Math.min(...ch.from.filter((f) => f > from), ch.steps.length);
  return { widget: ch.versions[version], steps: ch.steps.slice(from, end) };
}

/** Where a chapter step sits: its scene (0-based, in order) and its index within that scene. */
export function sceneAt(ch: Chapter, k: number): { scene: number; index: number; from: number } {
  const starts = [...new Set(ch.from)].sort((a, b) => a - b);
  let scene = 0;
  starts.forEach((f, n) => { if (f <= k) scene = n; });
  return { scene, index: k - starts[scene], from: starts[scene] };
}

/** Follow-ups saved before reply modes existed are whole chapters. */
export const modeOf = (p: Part) => p.mode ?? 'chapter';

const isEmpty = (b?: Board) => !b || (!b.lines?.length && !b.values?.length);

/** Adds steps to a chapter: a step with a scene starts a new version, and tasks and boards carry on. */
function addSteps(ch: Chapter, steps: Step[], make: (st: Step, local: number, version: number) => Item) {
  for (const st of steps) {
    const k = ch.steps.length;
    const opens = !!st.scene;
    if (st.scene) { ch.versions.push(st.scene); ch.from.push(k); }
    const version = ch.versions.length - 1;
    const prevTask = k > 0 ? ch.tasks[k - 1] : '';
    ch.tasks.push(st.task?.trim() || prevTask);
    const carried = opens || k === 0 ? undefined : ch.boards[k - 1];
    ch.boards.push(st.board ? (isEmpty(st.board) ? undefined : st.board) : carried);
    ch.steps.push(st);
    ch.items.push(make(st, k, version));
  }
}

/**
 * The lesson as chapters, each holding its items in reading order. With `live`, a chapter still
 * being written joins at the end with the steps that can already be played.
 */
export function chaptersOf(r: LessonRecord, live = false): Chapter[] {
  const out: Chapter[] = [];
  const playable = (d?: Draft): Lesson | undefined => d?.mode === 'chapter' && d.ready && d.steps?.[0]?.scene
    ? { title: d.title ?? '', subject: d.subject ?? 'other', crumbs: d.crumbs ?? [], steps: d.steps.slice(0, d.ready), suggestions: [] }
    : undefined;
  const first = r.lesson ?? (live && r.status === 'generating' ? playable(r.draft) : undefined);
  if (!first) return [];
  const parts: (Part & { live?: boolean })[] = [{ question: r.question, mode: 'chapter', lesson: first, live: !r.lesson }, ...(r.more ?? [])];
  const pend = live && r.lesson && r.pending?.status === 'generating' ? playable(r.pending.draft) : undefined;
  if (pend) parts.push({ question: r.pending!.question, mode: 'chapter', lesson: pend, course: r.pending!.course, live: true });
  parts.forEach((p, part) => {
    const mode = modeOf(p);
    if (mode === 'chapter' && p.lesson) {
      const c = out.length;
      const L = p.lesson;
      const ch: Chapter = {
        title: r.names?.[c] || L.title, written: L.title, question: p.question, planned: p.course, ...(p.live ? { live: true } : {}),
        versions: [], from: [], steps: [], tasks: [], boards: [], items: [],
      };
      // saved before scenes existed: one visual for every step, and one task
      if (L.widget && !L.steps[0]?.scene) { ch.versions.push(L.widget); ch.from.push(0); }
      addSteps(ch, L.steps, (st, local, version) => ({ kind: 'step', text: st.text, chapter: c, local, version, part, i: 0 }));
      if (L.task) ch.tasks = ch.tasks.map((t) => t || L.task!);
      out.push(ch);
      if (part > 0 && !p.course) ch.items[0].asked = p.question;
      if (L.sources?.length) ch.items[ch.items.length - 1].sources = L.sources;
      return;
    }
    const c = Math.min(p.at ?? out.length - 1, out.length - 1);
    const ch = out[c];
    if (mode === 'extend' && p.steps?.length) {
      const last = ch.versions.length - 1;
      if (p.edited) { ch.versions.push(p.edited); ch.from.push(ch.from[last]); }
      else if (p.widget) { ch.versions.push(p.widget); ch.from.push(0); }
      const first = ch.items.length;
      const task = p.widget ? p.task : undefined;
      addSteps(ch, p.steps, (st, local, version) => ({ kind: 'step', text: st.text, chapter: c, local, version, part, i: 0 }));
      if (task) for (let k = first; k < ch.steps.length; k++) if (!ch.steps[k].task) ch.tasks[k] = task;
      ch.items[first].asked = p.question;
      if (p.sources?.length) ch.items[ch.items.length - 1].sources = p.sources;
    } else if (mode === 'text' && p.text) {
      const last = ch.items[ch.items.length - 1];
      ch.items.push({ kind: 'text', text: p.text, chapter: c, local: last.local, version: last.version, part, asked: p.question, i: 0, ...(p.sources?.length ? { sources: p.sources } : {}) });
    }
  });
  let i = 0;
  for (const ch of out) for (const it of ch.items) it.i = i++;
  return out;
}

/** Every item of every chapter, in reading order. */
export const itemsOf = (chs: Chapter[]) => chs.flatMap((c) => c.items);

/** The last suggestions written, for the composer. */
export function lastSuggestions(r: LessonRecord): string[] {
  const more = r.more ?? [];
  const p = more[more.length - 1];
  return (p ? p.suggestions ?? p.lesson?.suggestions : r.lesson?.suggestions) ?? [];
}

/** How many of the course's planned chapters are written (the lesson's first chapter is one). */
export const courseWritten = (r: LessonRecord) => (r.lesson ? 1 : 0) + (r.more ?? []).filter((p) => p.course).length;
