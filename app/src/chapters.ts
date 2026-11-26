// How a stored lesson reads as chapters. Shared by the app (what it shows) and the sidecar (what it
// tells Claude about earlier chapters), so both see the same numbering and the same current visuals.
import type { LessonRecord, Part, Step, Widget } from './lesson';

/** One thing the learner reads in order: a step that drives the visual, or a text-only reply. */
export interface Item {
  kind: 'step' | 'text';
  text: string;
  /** the chapter it belongs to */
  chapter: number;
  /** the step index the chapter's visual shows for it */
  local: number;
  /** which version of the chapter's visual it shows */
  version: number;
  /** the part (0 = the lesson, then each follow-up) that wrote it */
  part: number;
  /** set on the first item of a follow-up: the question it answers */
  asked?: string;
  /** index among all items */
  i: number;
}

export interface Chapter {
  /** shown title: the learner's rename, else the one Claude wrote */
  title: string;
  /** the title Claude wrote */
  written: string;
  /** the question that opened the chapter */
  question: string;
  /** every visual the chapter has had, oldest first; an extend that redraws adds one */
  versions: Widget[];
  /** what to try, per version */
  tasks: string[];
  /** every step the visual is driven by, in order (follow-ups that continue append here) */
  steps: Step[];
  items: Item[];
}

/** Follow-ups saved before reply modes existed are whole chapters. */
export const modeOf = (p: Part) => p.mode ?? 'chapter';

/** The lesson as chapters, each holding its items in reading order. */
export function chaptersOf(r: LessonRecord): Chapter[] {
  if (!r.lesson) return [];
  const out: Chapter[] = [];
  const parts: Part[] = [{ question: r.question, mode: 'chapter', lesson: r.lesson }, ...(r.more ?? [])];
  parts.forEach((p, part) => {
    const mode = modeOf(p);
    if (mode === 'chapter' && p.lesson) {
      const c = out.length;
      out.push({
        title: r.names?.[c] || p.lesson.title, written: p.lesson.title, question: p.question,
        versions: [p.lesson.widget], tasks: [p.lesson.task], steps: [...p.lesson.steps],
        items: p.lesson.steps.map((st, local) => ({ kind: 'step', text: st.text, chapter: c, local, version: 0, part, i: 0 })),
      });
      if (part > 0) out[c].items[0].asked = p.question;
      return;
    }
    const c = Math.min(p.at ?? out.length - 1, out.length - 1);
    const ch = out[c];
    if (mode === 'extend' && p.steps?.length) {
      if (p.widget) { ch.versions.push(p.widget); ch.tasks.push(p.task || ch.tasks[ch.tasks.length - 1]); }
      const version = ch.versions.length - 1;
      const first = ch.items.length;
      for (const st of p.steps) {
        ch.items.push({ kind: 'step', text: st.text, chapter: c, local: ch.steps.length, version, part, i: 0 });
        ch.steps.push(st);
      }
      ch.items[first].asked = p.question;
    } else if (mode === 'text' && p.text) {
      const last = ch.items[ch.items.length - 1];
      ch.items.push({ kind: 'text', text: p.text, chapter: c, local: last.local, version: last.version, part, asked: p.question, i: 0 });
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
