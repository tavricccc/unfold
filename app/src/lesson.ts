// Lesson script as written by the sidecar (see sidecar/prompt.ts for the schema Claude follows).

export type Subject = 'algorithm' | 'math' | 'physics' | 'language' | 'art' | 'other';

export interface Step {
  text: string;
  /** bubble-sort: full passes completed when this step is shown */
  pass?: number;
  /** plot: parameter values to animate to when this step is shown */
  set?: { name: string; value: number }[];
}

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
  kind: 'bubble-sort' | 'plot' | 'html';
  values?: number[];
  plot?: PlotSpec;
  html?: string;
}

export interface Lesson {
  title: string;
  subject: Subject;
  crumbs: string[];
  widget: Widget;
  steps: Step[];
  task: string;
  suggestions: string[];
}

export type Status = 'generating' | 'ready' | 'error';

/** What one generation cost, as Claude Code reports it (API prices, also on a subscription). */
export interface Cost {
  usd: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** A follow-up answered inside a lesson: more steps appended after the lesson's own. */
export interface Part {
  question: string;
  lesson: Lesson;
  model?: string;
  cost?: Cost;
}

/** A follow-up still being written, or one that failed. */
export interface Pending {
  question: string;
  status: 'generating' | 'error';
  draft?: Partial<Lesson>;
  error?: string;
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
  draft?: Partial<Lesson>;
  model?: string;
  cost?: Cost;
  error?: string;
  more?: Part[];
  pending?: Pending;
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
}

export type LessonEvent =
  | { id: string; type: 'status'; text: string }
  | { id: string; type: 'partial'; lesson: Partial<Lesson>; more?: boolean }
  | { id: string; type: 'ready' }
  | { id: string; type: 'error'; message: string };
