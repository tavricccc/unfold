import type { ReactNode } from 'react';
import type { Subject } from './lesson';
import { ICONS } from './kit/icons';

const S = ({ children, w = 1.6, size = 16 }: { children: ReactNode; w?: number; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** A kit icon (Lucide) at the sidebar's line weight. */
const K = (name: string) => () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
);

export const Icon = {
  chemistry: K('flask-conical'),
  biology: K('dna'),
  earth: K('earth'),
  history: K('scroll-text'),
  geography: K('map'),
  civics: K('landmark'),
  x: () => <S w={1.9} size={13}><path d="M6 6l12 12M18 6 6 18" /></S>,
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
  out: () => <S w={2} size={13}><path d="M7 17 17 7M8 7h9v9" /></S>,
  right: () => <S w={2} size={13}><path d="M5 12h14M13 6l6 6-6 6" /></S>,
  check: () => <S w={2.6} size={14}><path d="m5 12 5 5 9-10" /></S>,
  search: () => <S w={1.8} size={14}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></S>,
  trash: () => <S w={1.7} size={14}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></S>,
  sidebar: () => <S w={1.7} size={15}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M9 4v16" /></S>,
  expand: () => <S w={1.8} size={14}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></S>,
  shrink: () => <S w={1.8} size={14}><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" /></S>,
  play: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.2v13.6a1 1 0 0 0 1.5.85l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 7 5.2z" /></svg>,
  pause: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.5" height="14" rx="1.2" /><rect x="13.5" y="5" width="4.5" height="14" rx="1.2" /></svg>,
  shuffle: () => <S w={1.8} size={14}><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></S>,
  keyboard: () => <S w={1.7} size={15}><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h.01M11 13h.01M15 13h.01M8 16h8" /></S>,
  move: () => <S w={1.8} size={14}><path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3" /></S>,
  restart: () => <S w={1.8} size={14}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></S>,
  sun: () => <S w={1.7} size={14}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></S>,
  moon: () => <S w={1.7} size={14}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></S>,
  ask: () => <S w={1.8} size={14}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></S>,
};

export const subjectIcon = (s?: Subject) => ((Icon as Record<string, () => ReactNode>)[s ?? 'other'] ?? Icon.other)();

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

/** Renders **bold** and `inline code` markers from lesson text. */
export function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="ic">{part.slice(1, -1)}</code>;
    return part;
  });
}
