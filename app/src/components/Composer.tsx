import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../icons';

/** The pill-shaped question box with the travelling glow. */
export function Composer({ onSubmit, onStop, placeholder, busy, status, big, autoFocus, suggestions }: {
  onSubmit: (q: string) => void;
  onStop?: () => void;
  placeholder: string;
  busy?: boolean;
  status?: string;
  big?: boolean;
  autoFocus?: boolean;
  suggestions?: string[];
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const send = (q = text) => {
    const v = q.trim();
    if (!v || busy) return;
    onSubmit(v);
    setText('');
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={big ? 'ask' : 'composer'}>
      {!big && busy && status && <div className="status"><span className="dots"><i /><i /><i /></span>{status}</div>}
      {!big && !busy && suggestions && suggestions.length > 0 && (
        <div className="sugg">{suggestions.map((s) => <button key={s} className="sg" onClick={() => send(s)}>{s}</button>)}</div>
      )}
      <div className={`glow${busy ? ' live' : text ? '' : ' quiet'}`}>
        <div className="box">
          <textarea
            ref={ref} rows={1} value={text} autoFocus={autoFocus} placeholder={placeholder}
            onChange={(e) => setText(e.target.value)} onKeyDown={onKey} aria-label={placeholder}
          />
          {busy && onStop
            ? <button className="send stop" aria-label="停止生成" title="停止生成" onClick={onStop}><Icon.stop /></button>
            : <button className="send" aria-label="送出" disabled={busy || !text.trim()} onClick={() => send()}><Icon.send /></button>}
        </div>
      </div>
    </div>
  );
}
