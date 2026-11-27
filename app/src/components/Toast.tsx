import { useEffect, useState } from 'react';
import { Icon } from '../icons';

export interface ToastItem {
  id: number;
  text: string;
  tone?: 'info' | 'ok' | 'err';
  action?: { label: string; onClick: () => void };
  /** stays until the learner acts on it or closes it */
  sticky?: boolean;
}

export function ToastStack({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="toasts" role="region" aria-label="通知">
      {items.map((item) => <ToastRow key={item.id} item={item} dismiss={dismiss} />)}
    </div>
  );
}

function ToastRow({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const ms = item.tone === 'err' ? 6000 : 3800;

  useEffect(() => {
    if (paused || item.sticky) return;
    const t = window.setTimeout(() => dismiss(item.id), ms);
    return () => window.clearTimeout(t);
  }, [dismiss, item.id, item.sticky, ms, paused]);

  return (
    <div
      className={`toast ${item.tone ?? 'info'}`}
      role={item.tone === 'err' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="toast-dot" aria-hidden="true" />
      <span className="toast-tx">{item.text}</span>
      {item.action && (
        <button
          type="button" className="toast-act"
          onClick={() => { item.action!.onClick(); dismiss(item.id); }}
        >{item.action.label}</button>
      )}
      <button type="button" className="toast-x" onClick={() => dismiss(item.id)} aria-label="關閉">
        <Icon.x />
      </button>
    </div>
  );
}
