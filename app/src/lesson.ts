// Lesson script as written by the sidecar (see sidecar/prompt.ts for the schema Claude follows).

export const SUBJECTS = ['math', 'physics', 'chemistry', 'biology', 'earth', 'history', 'geography', 'civics', 'language', 'algorithm', 'software', 'art', 'other'] as const;
export type Subject = typeof SUBJECTS[number];

export const SUBJECT_LABEL: Record<Subject, string> = {
  math: '數學',
  physics: '物理',
  chemistry: '化學',
  biology: '生物',
  earth: '地科',
  history: '歷史',
  geography: '地理',
  civics: '公民',
  language: '語文',
  algorithm: '演算法',
  software: '軟體',
  art: '藝術',
  other: '其他',
};

export interface Step {
  text: string;
  /** bubble-sort: full passes completed when this step is shown */
  pass?: number;
  /** plot: parameter values to animate to when this step is shown */
  set?: { name: string; value: number }[];
  /** kit visuals: ids that appear at this step and stay */
  reveal?: string[];
  /** kit visuals: ids emphasised while this step is shown */
  focus?: string[];
}

/** The declarative visuals the kit draws (src/kit/runtime.js); their ids are what steps reveal and focus. */
export interface ChartSpec {
  type: 'bar' | 'stacked' | 'line' | 'pie';
  title?: string; unit?: string; yMin?: number; yMax?: number;
  labels: string[];
  series: { id: string; name?: string; values: number[] }[];
  marks?: { id: string; label: string; series?: string; text: string }[];
}
/** box: a card (default); terminal: start or end; decision: a yes/no branch; io: input or output; store: data at rest */
export const NODE_SHAPES = ['box', 'terminal', 'decision', 'io', 'store'] as const;
export type NodeShape = typeof NODE_SHAPES[number];
export const COMPONENT_KINDS = ['user', 'client', 'mobile', 'service', 'api', 'function', 'module', 'file', 'doc', 'db', 'cache', 'queue', 'storage', 'external', 'process', 'tool'] as const;
export type ComponentKind = typeof COMPONENT_KINDS[number];
export interface Edge { id?: string; from: string; to: string; label?: string; dashed?: boolean; both?: boolean }
export interface DiagramSpec {
  layout: 'flow' | 'down' | 'tree' | 'cycle' | 'hub' | 'free';
  title?: string;
  nodes: { id: string; label: string; text?: string; icon?: string; shape?: NodeShape; x?: number; y?: number }[];
  edges: Edge[];
}
/** A system as groups (layers, tiers, packages) of components joined by connections. */
export interface ArchitectureSpec {
  title?: string;
  /** down: groups stacked top to bottom (default); right: groups side by side */
  direction?: 'down' | 'right';
  groups?: { id: string; label: string; text?: string; icon?: string }[];
  nodes: { id: string; label: string; text?: string; group?: string; kind?: ComponentKind; icon?: string; shape?: NodeShape }[];
  edges: Edge[];
}
export interface TimelineSpec {
  title?: string;
  events: { id: string; when: string; at?: number; title: string; text?: string; icon?: string }[];
  spans?: { id: string; from: string; to: string; label?: string }[];
}
export interface CompareSpec {
  title?: string;
  columns: { id: string; title: string; icon?: string }[];
  rows: { id: string; label: string; cells: string[] }[];
}
export interface PointsSpec {
  title?: string; center?: string;
  items: { id: string; title: string; text?: string; icon?: string }[];
}
export interface PassageSpec {
  /** the text, with [[id|words]] around each part a step can point at */
  text: string;
  source?: string;
  notes?: { id: string; text: string }[];
}
/** Step-by-step code execution trace with highlighted lines, live variables and optional output. */
export interface CodeSpec {
  title?: string;
  language?: string;
  lines: string[];
  states: {
    id: string;
    /** 1-based line numbers highlighted at this state */
    lines: number[];
    /** variable name -> display value */
    vars?: Record<string, string>;
    output?: string;
    note?: string;
  }[];
}
/** Interactive formative check: single or multiple-choice questions with instant feedback and explanations. */
export interface QuizSpec {
  title?: string;
  questions: {
    id: string;
    prompt: string;
    options: string[];
    /** 0-based indices of correct option(s) */
    answer: number[];
    explanation: string;
    hint?: string;
  }[];
}
export const KIT_KINDS = ['chart', 'diagram', 'architecture', 'timeline', 'compare', 'points', 'passage', 'code', 'quiz'] as const;
export type KitKind = typeof KIT_KINDS[number];

export type Expr = string | number;

export interface PlotItem {
  type: 'function' | 'area' | 'riemann' | 'tangent' | 'point' | 'vector' | 'segment' | 'polygon' | 'text';
  expr?: Expr;
  x?: Expr;
  y?: Expr;
  a?: Expr;
  b?: Expr;
  n?: Expr;
  at?: Expr;
  from?: [Expr, Expr];
  to?: [Expr, Expr];
  points?: [Expr, Expr][];
  drag?: string;
  label?: string;
  text?: string;
  color?: 'accent' | 'ink' | 'muted';
  dashed?: boolean;
  /** [first, last] 0-based steps where this item is visible */
  show?: [number, number?];
}

export interface PlotSpec {
  x: [number, number];
  y: [number, number];
  equalAxes?: boolean;
  params?: { name: string; label?: string; min: number; max: number; value: number; step?: number; slider?: boolean }[];
  items: PlotItem[];
  readouts?: { label: string; expr: string; digits?: number }[];
}

export interface Widget {
  kind: 'bubble-sort' | 'plot' | 'html' | KitKind;
  values?: number[];
  plot?: PlotSpec;
  html?: string;
  chart?: ChartSpec;
  diagram?: DiagramSpec;
  architecture?: ArchitectureSpec;
  timeline?: TimelineSpec;
  compare?: CompareSpec;
  points?: PointsSpec;
  passage?: PassageSpec;
  code?: CodeSpec;
  quiz?: QuizSpec;
}

export interface Lesson {
  title: string;
  subject: Subject;
  crumbs: string[];
  widget: Widget;
  steps: Step[];
  task: string;
  suggestions: string[];
  /** files Claude read from the reference folders to write it, relative to their folder */
  sources?: string[];
}

/** asking: Claude asked the learner questions and waits for their answers */
export type Status = 'generating' | 'asking' | 'ready' | 'error';

/** What one generation cost, as Claude Code reports it (API prices, also on a subscription). */
export interface Cost {
  usd: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * How Claude chose to answer a follow-up:
 * - chapter: a new chapter with its own visual (also how every lesson starts)
 * - extend:  more steps in the chapter being read, on its visual or on a redrawn one
 * - text:    a reply in words only; the visual stays as it is
 */
export type Mode = 'chapter' | 'extend' | 'text';

/** A follow-up answered inside a lesson. */
export interface Part {
  question: string;
  /** missing on follow-ups saved before modes existed: those are chapters */
  mode?: Mode;
  /** chapter: the new chapter */
  lesson?: Lesson;
  /** extend and text: the chapter (0-based) the learner was reading when they asked */
  at?: number;
  /** extend: the steps added, numbered on after the chapter's own */
  steps?: Step[];
  /** extend: the redrawn visual, when the visual changes (it still plays the earlier steps) */
  widget?: Widget;
  /** extend: what to try on the redrawn visual */
  task?: string;
  /** text: the reply */
  text?: string;
  suggestions?: string[];
  /** extend and text: files read from the reference folders to write it (a chapter keeps its own) */
  sources?: string[];
  /** chapter: one of the course's planned chapters (question holds its goal), not a follow-up */
  course?: boolean;
  model?: string;
  cost?: Cost;
}

/** Before a new lesson is taught, Claude may ask the learner a few questions. */
export interface AskQuestion {
  id: string;
  text: string;
  options: string[];
  /** several options may be picked */
  multi?: boolean;
}
export interface Ask { text?: string; questions: AskQuestion[] }
/** The learner's answer to one question; an empty list of answers means they skipped. */
export interface Answer { question: string; answer: string }

/** A lesson taught as a whole course: Claude plans the chapters, then writes them one by one. */
export interface Course {
  title: string;
  outline: { title: string; goal: string }[];
}

/** What Claude streams before it finishes: enough to show the reply as it is written. */
export type Draft = Partial<Lesson> & { mode?: Mode | 'ask' | 'course'; text?: string };

/** A follow-up still being written, or one that failed. */
export interface Pending {
  question: string;
  status: 'generating' | 'error';
  /** the chapter being read when it was asked */
  at?: number;
  draft?: Draft;
  error?: string;
  /** the course's next chapter, being written (or failed) */
  course?: boolean;
}

/** A lesson as stored on disk by the backend. */
export interface LessonRecord {
  id: string;
  question: string;
  status: Status;
  createdAt: number;
  step: number;
  lesson?: Lesson;
  /** title and steps written so far while generating */
  draft?: Draft;
  model?: string;
  cost?: Cost;
  error?: string;
  more?: Part[];
  pending?: Pending;
  /** the learner's own chapter titles, by chapter index */
  names?: Record<string, string>;
  /** the Claude Code session the lesson was written in; follow-ups resume it */
  session?: string;
  /** the questions Claude asked before teaching */
  ask?: Ask;
  /** what the learner answered (empty when they skipped) */
  answers?: Answer[];
  /** set when the lesson is a whole course */
  course?: Course;
  /** folders Claude may read for this lesson (absolute paths), fixed when it starts */
  refs?: string[];
}

/** The light summary used by the sidebar and home. */
export interface LessonMeta {
  id: string;
  question: string;
  status: Status;
  createdAt: number;
  step: number;
  title?: string;
  subject?: Subject;
  total?: number;
  /** how many reference folders it reads from */
  refs?: number;
}

export type LessonEvent =
  | { id: string; type: 'status'; text: string }
  | { id: string; type: 'partial'; lesson: Draft; more?: boolean }
  | { id: string; type: 'ready' }
  | { id: string; type: 'error'; message: string };
