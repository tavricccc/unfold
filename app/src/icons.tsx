import type { ReactNode } from 'react';
import type { Subject } from './lesson';

const S = ({ children, w = 1.6, size = 16 }: { children: ReactNode; w?: number; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const Icon = {
  algorithm: () => <S><path d="M5 20V11M10 20V5M15 20v-7M20 20v-4" /></S>,
  math: () => <S><path d="M4 20h16L4 6z" /><path d="M4 16h4v4" /></S>,
  physics: () => <S><path d="M3 19c4-12 14-12 18 0" /><circle cx="16.5" cy="10.5" r="1.6" fill="currentColor" /></S>,
  language: () => <S><path d="M4 6h9M8.5 4v2M6 6c.5 4 3 7 6.5 8.5M11 6c-.5 3.5-3 7-7 9" /><path d="m13 20 4-9 4 9M14.5 17h5" /></S>,
  art: () => <S><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.3" /></S>,
  other: () => <S><circle cx="12" cy="12" r="8" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></S>,
  plus: () => <S w={1.9}><path d="M12 5v14M5 12h14" /></S>,
  gear: () => <S><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>,
  chevron: () => <S w={2} size={12}><path d="m9 6 6 6-6 6" /></S>,
  pencil: () => <S w={1.8} size={13}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></S>,
  down: () => <S w={2} size={12}><path d="m6 9 6 6 6-6" /></S>,
  left: () => <S w={1.8} size={14}><path d="m15 6-6 6 6 6" /></S>,
  send: () => <S w={2.2} size={15}><path d="M12 19V5M6 11l6-6 6 6" /></S>,
  stop: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" /></svg>,
  retry: () => <S w={1.9} size={14}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></S>,
  check: () => <S w={2.6} size={14}><path d="m5 12 5 5 9-10" /></S>,
};

export const subjectIcon = (s?: Subject) => (Icon[s ?? 'other'] ?? Icon.other)();

export const Mark = () => (
  <span className="mark">
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path className="f f2" d="M12 7.2C9.6 5.6 6.4 5 2.8 5.4v12.2c3.6-.4 6.8.2 9.2 1.8z" />
      <path className="f" d="M12 7.2c2.4-1.6 5.6-2.2 9.2-1.8v12.2c-3.6-.4-6.8.2-9.2 1.8z" />
      <path className="ln2" d="M5.2 9.2c1.6-.1 3 .2 4.4.8M5.2 12c1.6-.1 3 .2 4.4.8M5.2 14.8c1.2-.1 2.3.1 3.2.4M14.4 12.8c1.4-.6 2.8-.9 4.4-.8M14.4 15.6c1.4-.6 2.8-.9 4.4-.8" />
      <circle className="acc" cx="16.6" cy="9.2" r="1.5" />
    </svg>
  </span>
);

/** Renders **bold** markers from lesson text. */
export function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part,
  );
}
