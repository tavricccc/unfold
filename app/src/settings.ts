import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'teal' | 'orange' | 'coral' | 'mono';
const ACCENTS: Accent[] = ['teal', 'orange', 'coral', 'mono'];
export type Model = 'sonnet' | 'opus' | 'haiku';
/** How hard the model thinks; 'auto' leaves it at the model's own default. */
export type Effort = 'auto' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORTS: Effort[] = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'];

export interface Settings { theme: Theme; accent: Accent; model: Model; effort: Effort }

const KEY = 'unfold.settings';
const DEFAULTS: Settings = { theme: 'system', accent: 'teal', model: 'sonnet', effort: 'auto' };

function load(): Settings {
  try {
    const s: Settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // an accent that no longer exists (the old green) falls back to the default
    if (!ACCENTS.includes(s.accent)) s.accent = DEFAULTS.accent;
    if (!EFFORTS.includes(s.effort)) s.effort = DEFAULTS.effort;
    return s;
  } catch {
    return DEFAULTS;
  }
}

export const MODEL_LABEL: Record<Model, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };
export const EFFORT_LABEL: Record<Effort, string> = { auto: '自動', low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高' };

/** What a generation is asked to run with: the model, and the effort unless it is left to the model. */
export interface Gen { model: Model; effort?: Exclude<Effort, 'auto'> }
export const genOf = (s: Settings): Gen => ({ model: s.model, effort: s.effort === 'auto' ? undefined : s.effort });

/** Settings live in localStorage and are applied to <html> as data-theme / data-accent. */
export function useSettings() {
  const [s, setS] = useState<Settings>(load);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(s));
    const root = document.documentElement;
    root.dataset.accent = s.accent;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { root.dataset.theme = s.theme === 'system' ? (mq.matches ? 'dark' : 'light') : s.theme; };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s]);
  const update = (p: Partial<Settings>) => setS((o) => ({ ...o, ...p }));
  return [s, update] as const;
}
