// Lesson script as written by the sidecar (see sidecar/prompt.ts for the schema Claude follows).

export type Subject = 'algorithm' | 'math' | 'physics' | 'language' | 'art' | 'other';

export interface Step {
  text: string;
  /** bubble-sort: full passes completed when this step is shown */
  pass?: number;
}

export interface Widget {
  kind: 'bubble-sort' | 'html';
  values?: number[];
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

/** A lesson as stored on disk by the backend. */
export interface LessonRecord {
  id: string;
  question: string;
  status: Status;
  createdAt: number;
  step: number;
  lesson?: Lesson;
  model?: string;
  error?: string;
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
  | { id: string; type: 'ready' }
  | { id: string; type: 'error'; message: string };
