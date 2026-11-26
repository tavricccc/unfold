// Shared sidebar for the Unfold design screens.
(() => {
  const q = new URLSearchParams(location.search);
  const root = document.documentElement;
  if (q.get('theme')) root.dataset.theme = q.get('theme');
  if (q.get('accent')) root.dataset.accent = q.get('accent');

  const s = (d, extra = '') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
  const I = {
    algo: s('<path d="M5 20V11M10 20V5M15 20v-7M20 20v-4"/>'),
    geo: s('<path d="M4 20h16L4 6z"/><path d="M4 16h4v4"/>'),
    phys: s('<path d="M3 19c4-12 14-12 18 0"/><circle cx="16.5" cy="10.5" r="1.6" fill="currentColor"/>'),
    lang: s('<path d="M4 6h9M8.5 4v2M6 6c.5 4 3 7 6.5 8.5M11 6c-.5 3.5-3 7-7 9"/><path d="m13 20 4-9 4 9M14.5 17h5"/>'),
    art: s('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.3"/>'),
    plus: s('<path d="M12 5v14M5 12h14"/>', 'stroke-width="1.9"'),
    search: s('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
    tree: s('<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 7-7 0 4-3 7-7 7zM12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z"/>'),
    panel: s('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>'),
    gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  };
  window.UNFOLD_ICONS = I;

  const active = document.body.dataset.active || '';
  const today = [
    ['bubble', 'algo', '泡泡排序是怎麼運作的？'],
    ['pyth', 'geo', '畢氏定理為什麼成立'],
    ['proj', 'phys', '斜拋：角度和距離', true],
  ];
  const week = [
    ['monet', 'art', '莫內怎麼畫光'],
    ['ro', 'lang', '五個羅馬尼亞語單字'],
    ['bsearch', 'algo', '二分搜尋'],
    ['circle', 'geo', '圓周率從哪來'],
  ];
  const row = ([id, ic, t, live]) =>
    `<a class="item${active === id ? ' on' : ''}">${I[ic]}<span>${t}</span>${live && active !== id ? '<i class="livedot" title="背景生成中"></i>' : ''}</a>`;

  const side = document.querySelector('.side');
  if (side) side.innerHTML = `
    <div class="ws">
      <span class="mark"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8 5 8-5M4 13l8 5 8-5"/></svg></span>
      <b>Unfold</b><span class="sp"></span><span class="ib" title="收合側欄">${I.panel}</span>
    </div>
    <a class="newb${active === 'home' ? ' on' : ''}">${I.plus}新的課<span class="kbd">⌘ N</span></a>
    <a class="nav">${I.search}搜尋<span class="kbd">⌘ K</span></a>
    <a class="nav${active === 'tree' ? ' on' : ''}">${I.tree}知識樹</a>
    <div class="grp">今天</div>${today.map(row).join('')}
    <div class="grp">本週</div>${week.map(row).join('')}
    <div class="grow"></div>
    <a class="me${active === 'settings' ? ' on' : ''}"><span class="av">T</span><span><div>設定</div><div class="st"><i></i>Claude Code 已連線</div></span><span style="margin-left:auto" class="ib">${I.gear}</span></a>`;
})();
