import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'teal' | 'orange' | 'coral' | 'mono';
const ACCENTS: Accent[] = ['teal', 'orange', 'coral', 'mono'];
export type Model = 'sonnet' | 'opus' | 'haiku';

export interface Settings { theme: Theme; accent: Accent; model: Model }

const KEY = 'unfold.settings';
const DEFAULTS: Settings = { theme: 'system', accent: 'teal', model: 'sonnet' };

function load(): Settings {
  try {
    const s: Settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    // an accent that no longer exists (the old green) falls back to the default
    return ACCENTS.includes(s.accent) ? s : { ...s, accent: DEFAULTS.accent };
  } catch {
    return DEFAULTS;
  }
}

export const MODEL_LABEL: Record<Model, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku' };

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
