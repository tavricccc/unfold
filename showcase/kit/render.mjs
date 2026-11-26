import fs from 'fs';
const [,, out, kind, specFile, stepIdx, theme] = process.argv;
const rt = fs.readFileSync('src/kit/runtime.js', 'utf8');
const iconsSrc = fs.readFileSync('src/kit/icons.ts', 'utf8');
const obj = iconsSrc.slice(iconsSrc.indexOf('{', iconsSrc.indexOf('ICONS')), iconsSrc.lastIndexOf('};') + 1);
const { spec, steps } = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const dark = theme === 'dark';
const vars = dark
  ? '--fg:#e6edf0;--fg-2:#adbbc1;--fg-3:#7d8f96;--fg-4:#56676e;--line:#24323a;--line-2:#33444c;--sub:#121a1e;--bg:#0c1215;--raise:#162025;--acc:#f08049;--acc-soft:#2c170b;--acc-ink:#ffa173;--acc-fg:#1a0a02;--done:#e6edf0;--sans:system-ui'
  : '--fg:#1f3038;--fg-2:#4a5c64;--fg-3:#66767e;--fg-4:#9aa8ae;--line:#dde5e9;--line-2:#c9d4d9;--sub:#e9eff2;--bg:#f0f4f6;--raise:#ffffff;--acc:#c4521b;--acc-soft:#f8e6dc;--acc-ink:#9c3f12;--acc-fg:#fff;--done:#1f3038;--sans:system-ui';
const isolate = (h) => h.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (all, at = '', c) => `<script${at}>{\n${c}\n}</script>`);
const body = kind === 'html' ? isolate(spec) : `<script>U.mount(${JSON.stringify(kind)}, ${JSON.stringify(spec)}, ${JSON.stringify(steps)})</script>`;
fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><style>:root{${vars}} html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:14px}</style>
<script>window.__UNFOLD_ICONS=${obj}</script><script>${rt}</script><script>addEventListener('message',e=>{if(e.data&&e.data.type==='widget-error')document.title='ERR '+e.data.message});window.parent=window;</script></head><body>${body}<script>setTimeout(()=>postMessage({type:'step',index:${stepIdx|0},animate:false},'*'),50)</script></body></html>`);
