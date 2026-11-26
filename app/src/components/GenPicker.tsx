import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { EFFORTS, EFFORT_LABEL, MODELS, MODEL_LABEL, type Settings } from '../settings';

/** The model and effort the next lesson is written with; the choice is saved with the settings. */
export function GenPicker({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => void }) {
  return (
    <span className="gp">
      <Pick label="模型" value={settings.model} options={MODELS.map((m) => [m, MODEL_LABEL[m]])} onPick={(model) => update({ model })} dot />
      <Pick label="思考深度" value={settings.effort} options={EFFORTS.map((e) => [e, EFFORT_LABEL[e]])} onPick={(effort) => update({ effort })} />
    </span>
  );
}

function Pick<T extends string>({ label, value, options, onPick, dot }: {
  label: string; value: T; options: [T, string][]; onPick: (v: T) => void; dot?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('mousedown', away);
    addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc); };
  }, [open]);
  const cur = options.find(([v]) => v === value)?.[1] ?? value;
  return (
    <span className="pick" ref={box}>
      <button type="button" className={`chip pb${open ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`${label}：${cur}`} title={label}>
        {dot && <i />}{cur}<Icon.down />
      </button>
      {open && (
        <span className="pmenu" role="menu">
          <span className="ph">{label}</span>
          {options.map(([v, l]) => (
            <button type="button" key={v} role="menuitemradio" aria-checked={v === value} className={`po${v === value ? ' on' : ''}`} onClick={() => { onPick(v); setOpen(false); }}>
              {l}{v === value && <Icon.check />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
