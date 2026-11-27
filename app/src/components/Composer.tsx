import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from '../icons';

/** The pill-shaped question box with the travelling glow; transitions gracefully to a rounded card when multi-line. */
export function Composer({ onSubmit, onStop, placeholder, busy, status, big, autoFocus, suggestions, foot, focusOnSlash }: {
  onSubmit: (q: string) => void;
  onStop?: () => void;
  placeholder: string;
  busy?: boolean;
  status?: string;
  big?: boolean;
  autoFocus?: boolean;
  suggestions?: string[];
  /** the line under the box: model, cost, hints */
  foot?: ReactNode;
  /** press "/" outside inputs to focus this composer */
  focusOnSlash?: boolean;
}) {
  const [text, setText] = useState('');
  const [multi, setMulti] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextH = Math.min(el.scrollHeight, 160);
    el.style.height = `${nextH}px`;
    setMulti(text.includes('\n') || nextH > (big ? 52 : 44));
  }, [text, big]);

  useEffect(() => {
    if (!focusOnSlash) return;
    const onSlash = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest('textarea, input, select, [contenteditable], [role="dialog"]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    addEventListener('keydown', onSlash);
    return () => removeEventListener('keydown', onSlash);
  }, [focusOnSlash]);

  const send = (q = text) => {
    const v = q.trim();
    if (!v || busy) return;
    onSubmit(v);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') { ref.current?.blur(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={big ? 'ask' : 'composer'}>
      {!big && busy && status && <div className="status"><span className="dots"><i /><i /><i /></span>{status}</div>}
      {!big && !busy && suggestions && suggestions.length > 0 && (
        <div className="sugg">{suggestions.map((s) => <button key={s} type="button" className="sg" onClick={() => send(s)}>{s}</button>)}</div>
      )}
      <div className={`glow${busy ? ' live' : text ? '' : ' quiet'}${multi ? ' multi' : ''}`}>
        <div className="box">
          <textarea
            ref={ref} rows={1} value={text} autoFocus={autoFocus} placeholder={placeholder}
            onChange={(e) => setText(e.target.value)} onKeyDown={onKey} aria-label={placeholder}
          />
          {busy && onStop
            ? <button type="button" className="send stop" aria-label="停止生成" title="停止生成" onClick={onStop}><Icon.stop /></button>
            : <button type="button" className="send" aria-label="送出" disabled={busy || !text.trim()} onClick={() => send()}><Icon.send /></button>}
        </div>
      </div>
      {foot && <div className="under">{foot}</div>}
    </div>
  );
}
