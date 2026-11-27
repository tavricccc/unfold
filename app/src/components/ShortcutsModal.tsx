import { useEffect } from 'react';
import { Icon } from '../icons';

const GROUPS: [string, [string[], string][]][] = [
  ['課程閱讀', [
    [['→', 'Enter', 'Space'], '下一步（動畫中先完成動畫）'],
    [['←'], '上一步'],
    [['PageDown', 'PageUp'], '切換下一章 / 上一章'],
    [['1 – 9'], '直接跳轉到對應章節'],
    [['/'], '聚焦追問輸入框'],
  ]],
  ['互動舞台', [
    [['R'], '重播這一步的動畫'],
    [['F'], '展開 / 還原互動舞台'],
    [['雙擊標題'], '重新命名當前章節'],
  ]],
  ['全域導覽', [
    [['Ctrl', 'K'], '快速搜尋課程與指令'],
    [['Ctrl', 'N'], '開始新的課'],
    [['Ctrl', 'B'], '收合 / 展開側邊欄'],
    [['Ctrl', ','], '開啟設定'],
    [['?'], '開啟快捷鍵一覽'],
  ]],
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="鍵盤快捷鍵">
        <div className="sheet-hd">
          <b>鍵盤快捷鍵</b>
          <button type="button" className="ib" onClick={onClose} aria-label="關閉"><Icon.x /></button>
        </div>
        <div className="sheet-bd">
          {GROUPS.map(([title, rows]) => (
            <section key={title} className="sk-sec">
              <h3>{title}</h3>
              {rows.map(([keys, desc]) => (
                <div key={desc} className="sk-row">
                  <span>{desc}</span>
                  <span className="sk-keys">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
