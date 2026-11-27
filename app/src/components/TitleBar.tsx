import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icon } from '../icons';

const inTauri = '__TAURI_INTERNALS__' in window;

/** The window's own title bar: optional sidebar toggle on the left, drag strip, and window buttons. */
export function TitleBar({ sidebarOpen, onToggleSidebar }: {
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
} = {}) {
  const [max, setMax] = useState(false);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    const onF = () => setFocused(true);
    const onB = () => setFocused(false);
    addEventListener('focus', onF);
    addEventListener('blur', onB);
    return () => { removeEventListener('focus', onF); removeEventListener('blur', onB); };
  }, []);

  useEffect(() => {
    if (!inTauri) return;
    const w = getCurrentWindow();
    const sync = () => w.isMaximized().then(setMax, (e) => console.error('read window state failed', e));
    sync();
    const off = w.onResized(sync);
    return () => { off.then((f) => f()); };
  }, []);

  const act = (f: (w: ReturnType<typeof getCurrentWindow>) => Promise<void>) => () => {
    if (inTauri) f(getCurrentWindow()).catch((e) => console.error('window action failed', e));
  };

  return (
    <div className={`tbar${focused ? '' : ' blur'}`} data-tauri-drag-region>
      {onToggleSidebar && (
        <button
          type="button" className={`tb-side${sidebarOpen === false ? ' off' : ''}`}
          onClick={onToggleSidebar} aria-label={sidebarOpen === false ? '展開側邊欄' : '收合側邊欄'}
          title={`${sidebarOpen === false ? '展開' : '收合'}側邊欄（Ctrl B）`} tabIndex={-1}
        >
          <Icon.sidebar />
        </button>
      )}
      <span className="tb-sp" data-tauri-drag-region />
      <button type="button" className="wb" onClick={act((w) => w.minimize())} aria-label="最小化" tabIndex={-1}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" /></svg>
      </button>
      <button type="button" className="wb" onClick={act((w) => w.toggleMaximize())} aria-label={max ? '還原' : '最大化'} tabIndex={-1}>
        {max
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="1" y="3" width="6" height="6" rx="1" /><path d="M3 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H7" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="1" y="1" width="8" height="8" rx="1.2" /></svg>}
      </button>
      <button type="button" className="wb close" onClick={act((w) => w.close())} aria-label="關閉" tabIndex={-1}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" /></svg>
      </button>
    </div>
  );
}
