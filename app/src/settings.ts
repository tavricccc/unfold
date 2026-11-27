import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'teal' | 'orange' | 'coral' | 'mono';
const ACCENTS: Accent[] = ['teal', 'orange', 'coral', 'mono'];
export type Model = 'sonnet' | 'opus' | 'haiku';
/** How hard the model thinks. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/** askFirst: always ask the learner before teaching a new lesson (otherwise Claude decides) */
export interface Settings { theme: Theme; accent: Accent; model: Model; effort: Effort; askFirst: boolean }

const KEY = 'unfold.settings';
const DEFAULTS: Settings = { theme: 'system', accent: 'orange', model: 'sonnet', effort: 'low', askFirst: false };

function load(): Settings {
  try {
    const s: Settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // a value that no longer exists (the old green, effort 'auto') falls back to the default
    // an accent that no longer exists (the old green) falls back to the default
    if (!ACCENTS.includes(s.accent)) s.accent = DEFAULTS.accent;
    if (!EFFORTS.includes(s.effort)) s.effort = DEFAULTS.effort;
    return s;
  } catch {
    return DEFAULTS;
  }
}

export const MODEL_LABEL: Record<Model, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };
export const EFFORT_LABEL: Record<Effort, string> = { low: '低', medium: '中', high: '高', xhigh: '很高', max: '最高' };

/** What a generation is asked to run with. */
export interface Gen { model: Model; effort: Effort }
export const genOf = (s: Settings): Gen => ({ model: s.model, effort: s.effort });
export const MODELS: Model[] = ['sonnet', 'opus', 'haiku'];

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
