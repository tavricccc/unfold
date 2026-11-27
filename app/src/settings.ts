import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'teal' | 'orange' | 'coral' | 'mono';
const ACCENTS: Accent[] = ['teal', 'orange', 'coral', 'mono'];
export type Model = 'sonnet' | 'opus' | 'haiku';
/** How hard the model thinks. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
export type FontSize = 'sm' | 'md' | 'lg';
const FONT_SIZES: FontSize[] = ['sm', 'md', 'lg'];

/**
 * askFirst: always ask the learner before teaching a new lesson (otherwise Claude decides)
 * fontSize: reading size of lesson narration
 * reducedMotion: user-level reduced motion override
 * sidebarOpen: whether the left sidebar is expanded
 * narrWidth: custom pixel width of the narration column in LessonView
 */
export interface Settings {
  theme: Theme;
  accent: Accent;
  model: Model;
  effort: Effort;
  askFirst: boolean;
  fontSize: FontSize;
  reducedMotion: boolean;
  sidebarOpen: boolean;
  narrWidth: number;
}

const KEY = 'unfold.settings';
export const DEFAULT_NARR_WIDTH = 380;
export const MIN_NARR_WIDTH = 280;
export const MAX_NARR_WIDTH = 560;

const DEFAULTS: Settings = {
  theme: 'system',
  accent: 'orange',
  model: 'sonnet',
  effort: 'low',
  askFirst: false,
  fontSize: 'md',
  reducedMotion: false,
  sidebarOpen: true,
  narrWidth: DEFAULT_NARR_WIDTH,
};

function clampNarr(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_NARR_WIDTH;
  return Math.max(MIN_NARR_WIDTH, Math.min(MAX_NARR_WIDTH, Math.round(n)));
}

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const s: Settings = { ...DEFAULTS, ...raw };
    if (!ACCENTS.includes(s.accent)) s.accent = DEFAULTS.accent;
    if (!EFFORTS.includes(s.effort)) s.effort = DEFAULTS.effort;
    if (!FONT_SIZES.includes(s.fontSize)) s.fontSize = DEFAULTS.fontSize;
    s.reducedMotion = Boolean(s.reducedMotion);
    s.sidebarOpen = raw.sidebarOpen === undefined ? true : Boolean(s.sidebarOpen);
    s.narrWidth = clampNarr(s.narrWidth);
    return s;
  } catch {
    return DEFAULTS;
  }
}

export const MODEL_LABEL: Record<Model, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };
export const EFFORT_LABEL: Record<Effort, string> = { low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高' };
export const FONT_SIZE_LABEL: Record<FontSize, string> = { sm: '精簡', md: '標準', lg: '舒適' };

/** What a generation is asked to run with. */
export interface Gen { model: Model; effort: Effort }
export const genOf = (s: Settings): Gen => ({ model: s.model, effort: s.effort });
export const MODELS: Model[] = ['sonnet', 'opus', 'haiku'];

/** Settings live in localStorage and are applied to <html> as data-* attributes and CSS variables. */
export function useSettings() {
  const [s, setS] = useState<Settings>(load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(s));
    const root = document.documentElement;
    root.dataset.accent = s.accent;
    root.dataset.size = s.fontSize;
    root.dataset.motion = s.reducedMotion ? 'reduced' : 'normal';
    root.style.setProperty('--col', `${clampNarr(s.narrWidth)}px`);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { root.dataset.theme = s.theme === 'system' ? (mq.matches ? 'dark' : 'light') : s.theme; };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s]);
  const update = (p: Partial<Settings>) => setS((o) => ({
    ...o,
    ...p,
    ...(p.narrWidth !== undefined ? { narrWidth: clampNarr(p.narrWidth) } : {}),
  }));
  return [s, update] as const;
}
