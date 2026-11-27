// The kit every lesson visual runs with, inside its sandboxed frame. It is loaded before the
// visual's own markup and gives it `U`:
//   - steps:     U.onStep((index, animate) => ...), called for step 0 on load and on every change
//   - motion:    U.tween(ms, t => ...), U.lerp, U.ease; a new step finishes running tweens first
//   - drawing:   U.svg, U.el, U.text, U.icon, U.iconHTML, U.arrow
//   - visuals:   U.mount(kind, spec, steps) for chart, diagram, timeline, compare, points, passage,
//                code, quiz; each element revealed and focused by the steps' "reveal" and "focus" ids
// Errors are reported to the host as { type: 'widget-error', message }.
/* eslint-disable */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const U = (window.U = {});
  const ICONS = window.__UNFOLD_ICONS || {};

  // ---------- errors ----------
  const report = (msg) => { try { parent.postMessage({ type: 'widget-error', message: String(msg).slice(0, 400) }, '*'); } catch (_) {} };
  addEventListener('error', (e) => report(`${e.message}${e.lineno ? ` (line ${e.lineno})` : ''}`));
  addEventListener('unhandledrejection', (e) => report(e.reason && e.reason.message ? e.reason.message : e.reason));
  const safe = (fn, ...a) => { try { return fn(...a); } catch (err) { report(err && err.message ? err.message : err); } };

  // ---------- motion ----------
  U.ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  U.lerp = (a, b, t) => a + (b - a) * t;
  const running = new Set();
  U.tween = (ms, fn, ease = U.ease) => new Promise((done) => {
    const tw = { fn, done, end: () => { running.delete(tw); safe(fn, 1); done(); } };
    running.add(tw);
    const t0 = performance.now();
    const frame = (now) => {
      if (!running.has(tw)) return;
      const t = Math.min(1, (now - t0) / ms);
      safe(fn, ease(t));
      if (t < 1) requestAnimationFrame(frame); else { running.delete(tw); done(); }
    };
    requestAnimationFrame(frame);
  });
  U.finish = () => [...running].forEach((tw) => tw.end());

  // ---------- steps & live theme ----------
  const handlers = [];
  const replayHandlers = [];
  U.step = -1;
  U.onStep = (fn) => { handlers.push(fn); if (U.step >= 0) safe(fn, U.step, false); };
  const go = (index, animate) => {
    U.finish();
    U.step = index;
    document.documentElement.classList.toggle('u-instant', !animate);
    handlers.forEach((h) => safe(h, index, animate));
  };
  const applyTheme = (vars) => {
    if (!vars) return;
    const root = document.documentElement.style;
    if (typeof vars === 'string') {
      vars.split(';').forEach((pair) => {
        const idx = pair.indexOf(':');
        if (idx > 0) root.setProperty(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      });
    } else if (typeof vars === 'object') {
      for (const k in vars) root.setProperty(k, vars[k]);
    }
  };
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d) return;
    if (d.type === 'step') go(d.index | 0, !!d.animate);
    else if (d.type === 'theme') applyTheme(d.vars);
    else if (d.type === 'replay') {
      const idx = d.index != null ? d.index | 0 : Math.max(0, U.step);
      if (replayHandlers.length) replayHandlers.forEach((fn) => safe(fn, idx));
      else if (idx > 0) { go(idx - 1, false); requestAnimationFrame(() => go(idx, true)); }
      else { go(0, true); }
    }
  });
  addEventListener('DOMContentLoaded', () => {
    const kids = [...document.body.children].filter((n) => !/^(SCRIPT|STYLE)$/.test(n.tagName));
    if (kids.length === 1 && kids[0].classList.contains('u-svg')) Object.assign(document.body.style, { display: 'flex', flexDirection: 'column', justifyContent: 'center' });
    if (U.step < 0) go(0, false);
  });

  // ---------- drawing ----------
  U.el = (parent, tag, attrs, text) => {
    const svgTag = parent ? parent.namespaceURI === NS && tag !== 'foreignObject' : true;
    const n = svgTag ? document.createElementNS(NS, tag) : document.createElement(tag);
    for (const k in attrs || {}) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  };
  U.svg = (w, h, parent) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    s.setAttribute('class', 'u-svg');
    s.style.maxWidth = `${w * 1.6}px`;
    s.style.maxHeight = `${h * 1.6}px`;
    s.style.margin = '0 auto';
    (parent || document.body).appendChild(s);
    return s;
  };
  U.text = (parent, x, y, str, o = {}) => U.el(parent, 'text', {
    x, y, 'text-anchor': o.anchor || 'start', 'dominant-baseline': o.baseline || 'middle',
    'font-size': o.size || 14, 'font-weight': o.weight || null, fill: o.color || 'var(--fg)', class: o.class || null,
  }, str);
  U.icon = (parent, name, x, y, size = 24, o = {}) => {
    const g = U.el(parent, 'g', {
      transform: `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`,
      fill: 'none', stroke: o.color || 'currentColor', 'stroke-width': o.width || 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: o.class || null,
    });
    if (!ICONS[name]) report(`unknown icon "${name}"`);
    g.innerHTML = ICONS[name] || ICONS['circle-question-mark'] || '';
    if (!o.color) g.style.color = 'var(--fg)';
    return g;
  };
  U.iconHTML = (name, size = 22) => {
    if (!ICONS[name]) report(`unknown icon "${name}"`);
    return `<svg class="u-ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  };
  /** An arrow from (x1, y1) to (x2, y2); bend > 0 curves it to the left of its direction. */
  U.arrow = (parent, x1, y1, x2, y2, o = {}) => {
    const g = U.el(parent, 'g', { class: o.class || null });
    const color = o.color || 'var(--fg-3)', w = o.width || 1.6, head = o.head || 7;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, bend = (o.bend || 0) * len;
    const cx = (x1 + x2) / 2 + nx * bend, cy = (y1 + y2) / 2 + ny * bend;
    const ex = x2 - cx, ey = y2 - cy, el = Math.hypot(ex, ey) || 1, ux = ex / el, uy = ey / el;
    const bx = x2 - ux * head * 0.9, by = y2 - uy * head * 0.9;
    const shaft = U.el(g, 'path', { d: o.bend ? `M${x1} ${y1}Q${cx} ${cy} ${bx} ${by}` : `M${x1} ${y1}L${bx} ${by}`, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': o.dashed ? '5 5' : null, class: o.dashed ? 'u-shaft u-dash' : 'u-shaft' });
    const hx = -uy, hy = ux;
    U.el(g, 'path', { d: `M${x2} ${y2}L${x2 - ux * head + hx * head * 0.55} ${y2 - uy * head + hy * head * 0.55}L${x2 - ux * head - hx * head * 0.55} ${y2 - uy * head - hy * head * 0.55}z`, fill: color, stroke: color, 'stroke-width': 1, 'stroke-linejoin': 'round', class: 'u-head' });
    if (o.both) U.el(g, 'path', { d: `M${x1} ${y1}L${x1 + ux * head - hx * head * 0.55} ${y1 + uy * head - hy * head * 0.55}L${x1 + ux * head + hx * head * 0.55} ${y1 + uy * head + hy * head * 0.55}z`, fill: color, class: 'u-head' });
    g.mid = { x: (x1 + 2 * cx + x2) / 4, y: (y1 + 2 * cy + y2) / 4 };
    g.shaft = shaft;
    return g;
  };

  // ---------- styles ----------
  const css = `
  .u-svg{display:block;width:100%;height:100%;overflow:visible}
  .u-root{position:absolute;inset:0;display:flex;flex-direction:column;padding:20px 24px;box-sizing:border-box;gap:14px}
  .u-title{font-size:13px;color:var(--fg-2);font-weight:500;text-align:center;letter-spacing:-.01em}
  .u-ic{flex:none;display:block}
  .u-code-inline{font-family:var(--mono);font-size:.9em;background:var(--sub);padding:1px 5px;border-radius:5px;color:var(--fg)}
  [data-u]{transition:opacity .48s cubic-bezier(.2,.7,.2,1),transform .55s cubic-bezier(.2,.7,.2,1),color .3s,background-color .3s,box-shadow .3s,fill .3s,stroke .3s}
  .u-instant [data-u],.u-instant [data-u] *,.u-instant .u-axis-fill{transition:none!important;animation:none!important}
  .u-hid{opacity:0!important;pointer-events:none}
  .u-dim{opacity:.34}
  .u-card{background:var(--raise,var(--bg));border-radius:12px;box-shadow:0 0 0 1px var(--line);color:var(--fg)}
  .u-focus.u-card,.u-card.u-focus{box-shadow:0 0 0 1.5px var(--acc),0 8px 22px -10px color-mix(in srgb,var(--acc) 48%,transparent)}
  .u-focus .u-ic{color:var(--acc)}
  /* shared floating hover tooltip */
  .u-tip{position:absolute;z-index:30;pointer-events:none;background:var(--fg);color:var(--bg);font-size:12px;line-height:1.45;padding:6px 10px;border-radius:8px;white-space:nowrap;box-shadow:0 8px 20px -8px rgb(0 0 0 / .35);transform:translate(-50%,calc(-100% - 10px)) scale(.96);opacity:0;transition:opacity .16s ease,transform .18s cubic-bezier(.2,.7,.2,1)}
  .u-tip.on{opacity:1;transform:translate(-50%,calc(-100% - 10px)) scale(1)}
  .u-tip b{font-weight:600;margin-right:6px}
  .u-tip em{font-style:normal;opacity:.75;margin-left:5px}
  /* diagram */
  .u-dg{position:relative;flex:1;min-height:0}
  .u-dg>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .u-node{position:absolute;transform:translate(-50%,-50%) scale(1);width:max-content;display:flex;align-items:center;gap:9px;padding:9px 13px;max-width:190px;box-sizing:border-box;font-size:14px;line-height:1.35;cursor:default}
  .u-node.u-hid{transform:translate(-50%,-50%) scale(.92)}
  .u-node:hover{transform:translate(-50%,-50%) translateY(-2px);z-index:6;box-shadow:0 0 0 1px var(--line-2),0 8px 20px -10px rgb(16 32 40 / .22)}
  .u-node.u-focus:hover{box-shadow:0 0 0 1.5px var(--acc),0 10px 24px -10px color-mix(in srgb,var(--acc) 55%,transparent)}
  .u-node.u-hover-rel{opacity:1!important}
  .u-node.u-hover-dim{opacity:.32!important}
  .u-node.v{flex-direction:column;text-align:center;gap:5px;padding:11px 13px}
  .u-node b{font-weight:600;display:block}
  .u-node small{display:block;color:var(--fg-2);font-size:12px;margin-top:2px}
  .u-elabel{font-size:12px;fill:var(--fg-2)}
  .u-edge .u-shaft{transition:stroke-dashoffset .65s cubic-bezier(.2,.7,.2,1),stroke .3s,stroke-width .3s}
  .u-edge.u-focus path{stroke:var(--acc)!important;fill:var(--acc)}
  .u-edge.u-focus path.u-shaft{fill:none;stroke-width:2.1}
  .u-edge.u-focus path.u-dash{animation:u-dash-flow 1.4s linear infinite}
  .u-edge.u-focus text{fill:var(--acc);font-weight:600}
  .u-edge.u-hover-rel{opacity:1!important}
  .u-edge.u-hover-rel path{stroke:var(--acc)!important;fill:var(--acc)}
  .u-edge.u-hover-rel path.u-shaft{fill:none;stroke-width:2}
  .u-edge.u-hover-dim{opacity:.2!important}
  @keyframes u-dash-flow{from{stroke-dashoffset:20}to{stroke-dashoffset:0}}
  /* chart */
  .u-ch{flex:1;min-height:0;position:relative}
  .u-legend{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--fg-2)}
  .u-legend span{display:inline-flex;align-items:center;gap:6px}
  .u-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
  .u-axis{stroke:var(--line);stroke-width:1}
  .u-tick{font-size:11.5px;fill:var(--fg-3)}
  .u-lab{font-size:12.5px;fill:var(--fg-2)}
  .u-val{font-size:12px;fill:var(--fg-2);font-variant-numeric:tabular-nums}
  .u-bar{transform-box:fill-box;transform-origin:50% 100%;cursor:pointer}
  .u-bar rect{transition:filter .18s ease,opacity .25s ease}
  .u-bar:hover rect{filter:brightness(1.08)}
  .u-bar.u-hid{opacity:1!important;transform:scaleY(0)}
  .u-line-path{transition:stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1),opacity .45s ease}
  .u-dot{cursor:pointer}
  .u-dot circle{transition:r .18s cubic-bezier(.2,.7,.2,1),stroke-width .18s}
  .u-dot:hover circle{r:6.5;stroke-width:2.5}
  .u-slice{cursor:pointer;transition:transform .32s cubic-bezier(.2,.7,.2,1),opacity .35s ease,filter .2s}
  .u-slice:hover{filter:brightness(1.06)}
  .u-pie-center{pointer-events:none;transition:opacity .25s ease}
  .u-focus .u-lab,.u-lab.u-focus{fill:var(--fg);font-weight:600}
  .u-mark{position:absolute;transform:translate(-50%,calc(-100% - 12px));background:var(--fg);color:var(--bg);font-size:12.5px;line-height:1.4;padding:6px 10px;border-radius:8px;max-width:200px;width:max-content;text-align:center;box-shadow:0 8px 20px -10px rgb(0 0 0 / .35);z-index:12}
  .u-mark::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:var(--fg)}
  .u-mark.u-hid{transform:translate(-50%,calc(-100% - 4px))}
  /* timeline */
  .u-tl{flex:1;position:relative;min-height:0}
  .u-tl .axis{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:var(--line);border-radius:2px}
  .u-axis-fill{position:absolute;top:50%;height:2px;margin-top:-1px;background:var(--acc);border-radius:2px;transition:left .48s cubic-bezier(.2,.7,.2,1),width .48s cubic-bezier(.2,.7,.2,1),opacity .35s ease;pointer-events:none}
  .u-span{position:absolute;top:50%;height:8px;margin-top:-4px;border-radius:4px;background:var(--acc-soft)}
  .u-span em{position:absolute;left:50%;top:12px;transform:translateX(-50%);font-style:normal;font-size:12px;color:var(--fg-2);white-space:nowrap}
  .u-span.u-focus{background:var(--acc)}
  .u-ev{position:absolute;width:0;top:50%;z-index:2}
  .u-ev.u-focus{z-index:5}
  .u-ev:hover{z-index:9}
  .u-ev .dot{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:var(--bg);box-shadow:inset 0 0 0 2px var(--fg-3);transition:box-shadow .3s ease,transform .25s ease}
  .u-ev.u-focus .dot{box-shadow:inset 0 0 0 6px var(--acc),0 0 0 4px var(--acc-soft);transform:scale(1.15)}
  .u-ev .stem{position:absolute;left:-.5px;width:1px;background:var(--line);transition:background-color .3s}
  .u-ev.u-focus .stem{background:var(--acc)}
  .u-ev .u-card{position:absolute;left:0;transform:translateX(var(--tx,-50%)) translateY(0);padding:9px 12px;font-size:13px;line-height:1.4;box-sizing:border-box;transition:transform .42s cubic-bezier(.2,.7,.2,1),box-shadow .25s ease,opacity .42s ease}
  .u-ev.up.u-hid .u-card{transform:translateX(var(--tx,-50%)) translateY(-10px)}
  .u-ev.dn.u-hid .u-card{transform:translateX(var(--tx,-50%)) translateY(10px)}
  .u-ev:hover .u-card{box-shadow:0 0 0 1px var(--line-2),0 10px 24px -10px rgb(16 32 40 / .24)}
  .u-ev.u-focus:hover .u-card{box-shadow:0 0 0 1.5px var(--acc),0 10px 24px -10px color-mix(in srgb,var(--acc) 50%,transparent)}
  .u-ev .when{font-size:12px;color:var(--fg-3);font-variant-numeric:tabular-nums;margin-bottom:2px;display:flex;align-items:center;gap:6px}
  .u-ev.u-focus .when{color:var(--acc)}
  .u-ev b{font-weight:600;display:block}
  .u-ev small{display:block;color:var(--fg-2);font-size:12px;margin-top:3px}
  /* compare */
  .u-cmp{flex:1;min-height:0;display:grid;align-content:center;gap:0;font-size:14px;line-height:1.5}
  .u-cmp .h{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;padding:10px 12px;border-radius:10px 10px 0 0;transition:color .25s,background-color .25s}
  .u-cmp .h.u-focus{color:var(--acc-ink,var(--acc))}
  .u-cmp .rl{color:var(--fg-2);font-size:13px;padding:11px 12px 11px 0;display:flex;align-items:center}
  .u-cmp .c{padding:11px 14px;border-top:1px solid var(--line);transition:background-color .25s,color .25s,opacity .4s,transform .4s}
  .u-cmp .c.u-hid,.u-cmp .rl.u-hid{transform:translateY(6px)}
  .u-cmp .col{background:var(--raise,var(--bg));box-shadow:0 0 0 1px var(--line);border-radius:12px;transition:box-shadow .3s ease}
  .u-cmp .col.u-focus{box-shadow:0 0 0 1.5px var(--acc),0 8px 22px -12px color-mix(in srgb,var(--acc) 45%,transparent)}
  .u-cmp .c.u-focus,.u-cmp .rl.u-focus{color:var(--fg);font-weight:500}
  .u-cmp .c.u-focus{background:var(--acc-soft)}
  .u-cmp .c.u-row-hover:not(.u-focus){background:color-mix(in srgb,var(--sub) 55%,transparent)}
  .u-cmp .rl.u-row-hover{color:var(--fg)}
  /* points */
  .u-pts{flex:1;min-height:0;display:grid;gap:12px;align-content:center}
  .u-pt{padding:14px 16px;display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.5;transform:translateY(0) scale(1)}
  .u-pt.u-hid{transform:translateY(10px) scale(.97)}
  .u-pt:hover{transform:translateY(-2px);box-shadow:0 0 0 1px var(--line-2),0 8px 20px -12px rgb(16 32 40 / .2)}
  .u-pt.u-focus:hover{box-shadow:0 0 0 1.5px var(--acc),0 10px 24px -10px color-mix(in srgb,var(--acc) 50%,transparent)}
  .u-pt .ib{width:36px;height:36px;border-radius:10px;background:var(--sub);display:grid;place-items:center;flex:none;color:var(--fg-2);transition:background-color .28s,color .28s,transform .32s cubic-bezier(.2,.7,.2,1)}
  .u-pt.u-focus .ib{background:var(--acc-soft);color:var(--acc);transform:scale(1.06)}
  .u-pt b{font-weight:600;display:block;margin-bottom:2px}
  .u-pt small{display:block;color:var(--fg-2);font-size:13px}
  .u-center{text-align:center;font-weight:600;font-size:15px}
  /* passage */
  .u-ps{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:safe center;gap:18px;overflow-y:auto;scrollbar-width:none}
  .u-ps.side{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:center;gap:24px}
  .u-ps.side .src{grid-column:1}
  .u-ps.side .u-notes{grid-column:2;grid-row:1 / span 2;align-self:center;min-height:0}
  .u-ps.side .u-note{flex-direction:column;gap:4px}
  .u-ps.side .u-note q{white-space:normal}
  .u-ps .txt{font-size:20px;line-height:2.1;letter-spacing:.02em;text-align:justify}
  .u-ps .txt.long{font-size:16px;line-height:1.95}
  .u-ps .src{font-size:12.5px;color:var(--fg-3);text-align:right}
  .u-hl{border-radius:4px;padding:1px 3px;margin:0 -2px;background-image:linear-gradient(var(--acc-soft),var(--acc-soft));background-size:100% 0;background-repeat:no-repeat;background-position:0 100%;transition:background-size .45s cubic-bezier(.2,.7,.2,1),color .25s,box-shadow .2s}
  .u-hl.on{background-size:100% 38%;cursor:pointer}
  .u-hl.on:hover{background-size:100% 65%}
  .u-hl.u-focus,.u-hl.u-pin{background-size:100% 100%;color:var(--fg)}
  .u-hl.u-pin{box-shadow:0 0 0 1px var(--acc)}
  .u-notes{display:flex;flex-direction:column;gap:8px;min-height:64px}
  .u-note{padding:10px 14px;font-size:14px;line-height:1.55;display:flex;gap:10px;animation:u-pop .28s cubic-bezier(.2,.7,.2,1) both}
  .u-note q{quotes:none;font-weight:600;color:var(--acc);white-space:nowrap}
  @keyframes u-pop{from{opacity:0;transform:translateY(6px) scale(.98)}to{opacity:1;transform:none}}
  /* code walkthrough */
  .u-code-wrap{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(200px,.85fr);gap:12px}
  @media (max-width:560px){.u-code-wrap{grid-template-columns:1fr;grid-template-rows:minmax(0,1.3fr) minmax(0,.9fr)}}
  .u-code-pane,.u-vars-pane{display:flex;flex-direction:column;min-height:0;overflow:hidden;border-radius:14px;background:var(--raise,var(--bg));box-shadow:0 0 0 1px var(--line)}
  .u-pane-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 14px;border-bottom:1px solid var(--line);font-size:12px;color:var(--fg-3)}
  .u-pane-hd b{font-family:var(--mono);font-weight:500;color:var(--fg)}
  .u-lang{font-family:var(--mono);font-size:11px;padding:2px 7px;border-radius:999px;background:var(--sub);color:var(--fg-2)}
  .u-code-src{flex:1;overflow:auto;padding:10px 0;font-family:var(--mono);font-size:12.5px;line-height:1.9;scrollbar-width:thin}
  .u-cline{display:flex;align-items:baseline;padding:0 14px 0 0;color:var(--fg-2);white-space:pre;min-width:max-content;transition:background-color .28s,color .25s,box-shadow .28s}
  .u-cline .no{flex:none;width:42px;text-align:right;padding-right:14px;color:var(--fg-4);user-select:none;font-variant-numeric:tabular-nums}
  .u-cline.hl{background:var(--acc-soft);color:var(--fg);box-shadow:inset 3px 0 0 var(--acc)}
  .u-cline.hl .no{color:var(--acc-ink,var(--acc));font-weight:600}
  .u-tok-kw{color:var(--acc-ink,var(--acc));font-weight:500}
  .u-tok-str{color:var(--fg-2);font-style:italic}
  .u-tok-num{color:var(--acc)}
  .u-tok-cm{color:var(--fg-4)}
  .u-code-note{padding:9px 14px;border-top:1px solid var(--line);background:var(--sub);font-size:12.5px;color:var(--fg-2);line-height:1.5;animation:u-pop .24s ease both}
  .u-vars-body{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
  .u-vrow{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:9px;background:var(--sub);font-family:var(--mono);font-size:12.5px;transition:background-color .35s,box-shadow .35s}
  .u-vrow.changed{background:var(--acc-soft);box-shadow:inset 0 0 0 1px var(--acc);animation:u-flash .6s ease}
  @keyframes u-flash{0%{transform:scale(1.02)}100%{transform:scale(1)}}
  .u-vrow .vk{color:var(--fg-3);font-weight:500}
  .u-vrow .vv{color:var(--fg);font-weight:600;text-align:right;word-break:break-all}
  .u-vrow.changed .vk,.u-vrow.changed .vv{color:var(--acc-ink,var(--acc))}
  .u-vrow .vprev{font-size:11px;color:var(--fg-4);text-decoration:line-through;margin-right:6px;font-weight:400}
  .u-vempty{margin:auto;font-size:12.5px;color:var(--fg-4);text-align:center}
  .u-out{border-top:1px solid var(--line);padding:9px 12px;background:color-mix(in srgb,var(--sub) 70%,transparent);font-family:var(--mono);font-size:12px}
  .u-out-lbl{font-family:var(--sans);font-size:11px;color:var(--fg-3);margin-bottom:4px}
  .u-out pre{margin:0;color:var(--fg);white-space:pre-wrap;word-break:break-word;animation:u-pop .24s ease both}
  .u-state-bar{display:flex;align-items:center;gap:5px;padding:8px 12px;border-top:1px solid var(--line);flex-wrap:wrap}
  .u-stbtn{font-family:var(--mono);font-size:11px;padding:2px 8px;border-radius:999px;background:var(--sub);color:var(--fg-3);border:0;cursor:pointer;transition:background-color .15s,color .15s}
  .u-stbtn:hover{color:var(--fg);background:var(--hover)}
  .u-stbtn.on{background:var(--acc);color:var(--acc-fg,#fff);font-weight:600}
  /* interactive quiz */
  .u-quiz{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:safe center;align-items:center;overflow-y:auto;scrollbar-width:thin}
  .u-qbox{width:100%;max-width:560px;display:flex;flex-direction:column;gap:14px;animation:u-pop .3s cubic-bezier(.2,.7,.2,1) both}
  .u-qnav{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .u-qtabs{display:flex;gap:6px;flex-wrap:wrap}
  .u-qtab{font-size:12px;font-variant-numeric:tabular-nums;padding:4px 10px;border-radius:999px;border:0;background:var(--sub);color:var(--fg-2);cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background-color .15s,color .15s,box-shadow .15s}
  .u-qtab:hover{background:var(--hover);color:var(--fg)}
  .u-qtab.on{background:var(--raise,var(--bg));color:var(--fg);font-weight:600;box-shadow:0 0 0 1.5px var(--acc)}
  .u-qtab.ok::after{content:"";width:6px;height:6px;border-radius:50%;background:var(--acc)}
  .u-qtab.no::after{content:"";width:6px;height:6px;border-radius:50%;background:#c43b3b}
  .u-qscore{font-size:12px;color:var(--fg-3);font-variant-numeric:tabular-nums}
  .u-qcard{padding:20px 22px;display:flex;flex-direction:column;gap:14px}
  .u-qprompt{font-size:16px;font-weight:500;line-height:1.6;color:var(--fg)}
  .u-qmulti{display:inline-block;margin-left:8px;font-size:11.5px;font-weight:500;color:var(--fg-3);background:var(--sub);padding:1px 8px;border-radius:999px;vertical-align:middle}
  .u-qlist{display:flex;flex-direction:column;gap:8px}
  .u-qopt{width:100%;text-align:left;display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:11px;border:0;background:var(--bg);color:var(--fg);font:inherit;font-size:14px;line-height:1.45;cursor:pointer;box-shadow:0 0 0 1px var(--line);transition:transform .16s cubic-bezier(.2,.7,.2,1),background-color .18s,box-shadow .18s,color .18s}
  .u-qopt:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 0 0 1px var(--line-2),0 4px 12px -8px rgb(16 32 40 / .2)}
  .u-qopt:not(:disabled):active{transform:scale(.99)}
  .u-qopt .key{flex:none;width:24px;height:24px;border-radius:7px;display:grid;place-items:center;font-family:var(--mono);font-size:12px;font-weight:600;background:var(--sub);color:var(--fg-2);transition:background-color .18s,color .18s}
  .u-qopt.sel{background:var(--acc-soft);box-shadow:0 0 0 1.5px var(--acc)}
  .u-qopt.sel .key{background:var(--acc);color:var(--acc-fg,#fff)}
  .u-qopt.ok{background:var(--acc-soft);box-shadow:0 0 0 1.5px var(--acc)}
  .u-qopt.ok .key{background:var(--acc);color:var(--acc-fg,#fff)}
  .u-qopt.no{background:color-mix(in srgb,#c43b3b 12%,var(--bg));box-shadow:0 0 0 1.5px #c43b3b}
  .u-qopt.no .key{background:#c43b3b;color:#fff}
  .u-qopt.missed{box-shadow:0 0 0 1.5px var(--acc);background:color-mix(in srgb,var(--acc-soft) 50%,var(--bg))}
  .u-qopt .tag{margin-left:auto;font-size:12px;font-weight:600}
  .u-qopt.ok .tag,.u-qopt.missed .tag{color:var(--acc-ink,var(--acc))}
  .u-qopt.no .tag{color:#c43b3b}
  .u-qact{display:flex;align-items:center;gap:10px;padding-top:2px}
  .u-qbtn{font:inherit;font-size:13.5px;font-weight:600;padding:8px 16px;border-radius:10px;border:0;cursor:pointer;transition:transform .16s,filter .15s,background-color .15s,opacity .15s}
  .u-qbtn.pri{background:var(--acc);color:var(--acc-fg,#fff)}
  .u-qbtn.pri:not(:disabled):hover{filter:brightness(1.08);transform:translateY(-1px)}
  .u-qbtn.pri:disabled{opacity:.42;cursor:default}
  .u-qbtn.ghost{background:var(--sub);color:var(--fg-2);font-weight:500}
  .u-qbtn.ghost:hover{background:var(--hover);color:var(--fg)}
  .u-qhint{font-size:13px;color:var(--fg-2);background:var(--sub);padding:9px 13px;border-radius:10px;line-height:1.55;animation:u-pop .22s ease both}
  .u-qexp{font-size:13.5px;line-height:1.65;color:var(--fg);background:var(--sub);padding:12px 14px;border-radius:11px;box-shadow:inset 3px 0 0 var(--acc);animation:u-pop .26s ease both}
  .u-qexp.bad{box-shadow:inset 3px 0 0 #c43b3b}
  .u-qexp b{display:block;font-size:12.5px;margin-bottom:3px;color:var(--acc-ink,var(--acc))}
  .u-qexp.bad b{color:#c43b3b}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- helpers ----------
  function stepper(reg, steps, after) {
    const firstAt = {};
    (steps || []).forEach((s, i) => (s && s.reveal || []).forEach((id) => { if (!(id in firstAt)) firstAt[id] = i; }));
    const apply = (i) => {
      const focus = new Set((steps && steps[i] && steps[i].focus) || []);
      const any = [...focus].some((id) => reg[id]);
      for (const id in reg) {
        const shown = !(id in firstAt) || i >= firstAt[id];
        for (const n of reg[id]) {
          const wasHid = n.classList.contains('u-hid');
          n.classList.toggle('u-hid', !shown);
          n.classList.toggle('u-focus', focus.has(id));
          if (n.dataset.dim !== 'no') n.classList.toggle('u-dim', any && shown && !focus.has(id) && !n.dataset.keep);
          if (wasHid && shown && n.dataset.drawLen) {
            const len = n.dataset.drawLen;
            const sh = n.querySelector('.u-shaft') || n;
            if (sh && !sh.classList.contains('u-dash')) {
              const instant = document.documentElement.classList.contains('u-instant');
              sh.style.transition = 'none';
              sh.style.strokeDasharray = len;
              sh.style.strokeDashoffset = instant ? '0' : len;
              if (!instant) {
                sh.getBoundingClientRect();
                sh.style.transition = '';
                sh.style.strokeDashoffset = '0';
              } else {
                sh.style.transition = '';
              }
            }
          }
        }
      }
      if (after) after(i, focus, firstAt);
    };
    return apply;
  }
  const missing = (reg, steps) => {
    const bad = new Set();
    (steps || []).forEach((s) => [...(s.reveal || []), ...(s.focus || [])].forEach((id) => { if (!reg[id]) bad.add(id); }));
    if (bad.size) report(`steps name ids that are not in the visual: ${[...bad].join(', ')}`);
  };
  const put = (reg, id, n) => { if (id == null) return; n.setAttribute('data-u', ''); (reg[id] = reg[id] || []).push(n); };
  const h = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code class="u-code-inline">$1</code>');
  function sized(box, draw) {
    let last = '';
    const run = () => {
      const r = box.getBoundingClientRect();
      const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (key === last || r.width < 10 || r.height < 10) return;
      last = key;
      safe(draw, r.width, r.height);
    };
    new ResizeObserver(run).observe(box);
    run();
  }
  function makeTip(host) {
    const tip = h('div', 'u-tip');
    host.appendChild(tip);
    return {
      show(x, y, html) {
        tip.innerHTML = html;
        const W = host.clientWidth || 400;
        tip.style.left = `${Math.max(70, Math.min(W - 70, x))}px`;
        tip.style.top = `${Math.max(36, y)}px`;
        tip.classList.add('on');
      },
      hide() { tip.classList.remove('on'); },
    };
  }

  // ---------- chart ----------
  function chart(root, spec, steps) {
    const series = spec.series || [];
    const labels = spec.labels || [];
    const type = spec.type || 'bar';
    if (spec.title) root.appendChild(h('div', 'u-title', esc(spec.title)));
    const box = h('div', 'u-ch');
    root.appendChild(box);
    const palette = (k) => (k === 0 ? 'var(--acc)' : ['var(--fg-2)', 'var(--fg-3)', 'color-mix(in srgb,var(--acc) 45%,var(--bg))', 'var(--line-2,var(--line))'][(k - 1) % 4]);
    if (type !== 'pie' && series.length > 1) {
      const lg = h('div', 'u-legend');
      series.forEach((s, k) => { const it = h('span', null, `<i style="background:${palette(k)}"></i>${esc(s.name || s.id)}`); lg.appendChild(it); });
      root.appendChild(lg);
    }
    let apply = () => {};
    let reanimate = () => {};
    const unit = spec.unit ? ` ${spec.unit}` : '';
    const fmt = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString() : String(Math.round(v * 100) / 100)) + unit;
    sized(box, (W, H) => {
      box.innerHTML = '';
      const tip = makeTip(box);
      const reg = {};
      const s = U.svg(W, H, box);
      if (type === 'pie') {
        const vals = (series[0] && series[0].values) || [];
        const tot = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
        const r = Math.min(W * 0.35, H / 2 - 18), cx = W / 2 - (W > 420 ? r * 0.52 : 0), cy = H / 2;
        const centerG = U.el(s, 'g', { class: 'u-pie-center' });
        const cBig = U.text(centerG, cx, cy - 8, '', { anchor: 'middle', size: Math.max(18, Math.min(26, r * 0.28)), weight: 600 });
        const cSub = U.text(centerG, cx, cy + 16, '', { anchor: 'middle', size: 12.5, color: 'var(--fg-3)' });
        const slices = [];
        const setCenter = (k) => {
          if (k == null || k < 0 || k >= vals.length) { cBig.textContent = fmt(tot); cSub.textContent = '總計'; return; }
          const pct = `${Math.round((Math.max(0, vals[k]) / tot) * 1000) / 10}%`;
          cBig.textContent = pct;
          cSub.textContent = labels[k] || '';
        };
        let a0 = -Math.PI / 2;
        vals.forEach((v, k) => {
          const a1 = a0 + (Math.max(0, v) / tot) * Math.PI * 2;
          const mid = (a0 + a1) / 2;
          const large = a1 - a0 > Math.PI ? 1 : 0, ri = r * 0.58;
          const p = (a, rr) => `${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}`;
          const g = U.el(s, 'g', {});
          const slice = U.el(g, 'path', {
            class: 'u-slice',
            d: `M${p(a0, r)}A${r} ${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, ri)}A${ri} ${ri} 0 ${large} 0 ${p(a0, ri)}z`,
            fill: palette(k), stroke: 'var(--bg)', 'stroke-width': 2,
          });
          const ox = Math.cos(mid) * 8, oy = Math.sin(mid) * 8;
          slices.push({ slice, ox, oy, label: labels[k], k });
          const pctStr = `${Math.round((Math.max(0, v) / tot) * 1000) / 10}%`;
          slice.addEventListener('mouseenter', () => {
            slice.style.transform = `translate(${ox}px, ${oy}px)`;
            setCenter(k);
            tip.show(cx + Math.cos(mid) * (r * 0.78), cy + Math.sin(mid) * (r * 0.78), `<b>${esc(labels[k] || '')}</b>${esc(fmt(v))}<em>${pctStr}</em>`);
          });
          slice.addEventListener('mouseleave', () => {
            slice.style.transform = g.classList.contains('u-focus') ? `translate(${ox}px, ${oy}px)` : '';
            const foc = slices.find((x) => x.slice.parentNode.classList.contains('u-focus'));
            setCenter(foc ? foc.k : null);
            tip.hide();
          });
          const lx = W > 420 ? cx + r + 28 : cx - r, ly = W > 420 ? cy - (vals.length - 1) * 13 + k * 26 : cy + r + 18 + k * 20;
          U.el(g, 'rect', { x: lx, y: ly - 5, width: 10, height: 10, rx: 3, fill: palette(k) });
          U.text(g, lx + 18, ly, `${labels[k] || ''}  ${pctStr}`, { anchor: 'start', size: 13, class: 'u-lab' });
          put(reg, labels[k], g);
          a0 = a1;
        });
        missing(reg, steps);
        apply = stepper(reg, steps, (_, focus) => {
          let activeK = null;
          slices.forEach(({ slice, ox, oy, label, k }) => {
            const on = focus.has(label);
            if (on && activeK == null) activeK = k;
            slice.style.transform = on ? `translate(${ox}px, ${oy}px)` : '';
          });
          setCenter(activeK);
        });
      } else {
        const stacked = type === 'stacked';
        const all = stacked ? labels.map((_, i) => series.reduce((a, se) => a + (se.values[i] || 0), 0)) : series.flatMap((se) => se.values);
        let lo = spec.yMin != null ? spec.yMin : Math.min(0, ...all), hi = spec.yMax != null ? spec.yMax : Math.max(...all, 0);
        if (hi === lo) hi = lo + 1;
        const stepv = niceStep((hi - lo) / 4);
        if (spec.yMax == null) hi = Math.ceil(hi / stepv) * stepv;
        if (spec.yMin == null) lo = Math.floor(lo / stepv) * stepv;
        const tickW = Math.max(...[lo, hi].map((v) => fmt(v).length)) * 7 + 14;
        const L = tickW, R = W - 10, T = 20, B = H - 30;
        const y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
        for (let v = lo; v <= hi + 1e-9; v += stepv) {
          U.el(s, 'line', { x1: L, x2: R, y1: y(v), y2: y(v), class: 'u-axis', 'stroke-dasharray': v === 0 ? null : '2 4' });
          U.text(s, L - 8, y(v), fmt(Math.round(v * 1e6) / 1e6), { anchor: 'end', class: 'u-tick' });
        }
        const bw = (R - L) / Math.max(1, labels.length);
        const cxAt = (i) => L + bw * (i + 0.5);
        labels.forEach((lab, i) => { const t = U.text(s, cxAt(i), B + 16, lab, { anchor: 'middle', class: 'u-lab' }); put(reg, lab, t); t.dataset.dim = 'no'; });
        const anchors = {};
        const animPaths = [];
        const animBars = [];
        if (type === 'line') {
          series.forEach((se, k) => {
            const g = U.el(s, 'g', {});
            const pts = se.values.map((v, i) => [cxAt(i), y(v)]);
            const pEl = U.el(g, 'path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(''), fill: 'none', stroke: palette(k), 'stroke-width': k === 0 ? 2.5 : 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'u-line-path u-shaft' });
            const len = pEl.getTotalLength ? Math.ceil(pEl.getTotalLength()) : 0;
            if (len > 0) { g.dataset.drawLen = String(len); animPaths.push({ el: pEl, len }); }
            pts.forEach((p, i) => {
              const d = U.el(s, 'g', { class: 'u-dot' });
              U.el(d, 'circle', { cx: p[0], cy: p[1], r: 4.5, fill: 'var(--bg)', stroke: palette(k), 'stroke-width': 2 });
              if (series.length === 1) U.text(d, p[0], p[1] - 14, fmt(se.values[i]), { anchor: 'middle', class: 'u-val' });
              const tipHtml = `<b>${esc(labels[i] || '')}</b>${series.length > 1 ? `${esc(se.name || se.id)} · ` : ''}${esc(fmt(se.values[i]))}`;
              d.addEventListener('mouseenter', () => tip.show(p[0], p[1] - 6, tipHtml));
              d.addEventListener('mouseleave', () => tip.hide());
              put(reg, labels[i], d);
              (anchors[labels[i]] = anchors[labels[i]] || {})[se.id] = p;
            });
            put(reg, se.id, g);
          });
        } else {
          const n = stacked ? 1 : series.length, gw = Math.min(bw * 0.7, 46 * n), w = gw / n;
          const base = labels.map(() => 0);
          const totals = stacked ? labels.map((_, i) => series.reduce((a, se) => a + Math.max(0, se.values[i] || 0), 0)) : [];
          series.forEach((se, k) => {
            se.values.forEach((v, i) => {
              const x = stacked ? cxAt(i) - gw / 2 : cxAt(i) - gw / 2 + w * k;
              const v0 = stacked ? base[i] : 0, v1 = v0 + v;
              const top = Math.min(y(v0), y(v1)), ht = Math.abs(y(v1) - y(v0));
              const g = U.el(s, 'g', { class: 'u-bar' });
              g.style.transitionDelay = `${Math.min(i * 35 + k * 25, 220)}ms`;
              U.el(g, 'rect', { x: x + 1, y: top, width: Math.max(1, w - 2), height: Math.max(0.5, ht), rx: Math.min(4, w / 4), fill: palette(k) });
              if (!stacked && n === 1) U.text(g, x + w / 2, top - 10, fmt(v), { anchor: 'middle', class: 'u-val' });
              const share = stacked && totals[i] > 0 ? `<em>${Math.round((v / totals[i]) * 100)}%</em>` : '';
              const tipHtml = `<b>${esc(labels[i] || '')}</b>${series.length > 1 ? `${esc(se.name || se.id)} · ` : ''}${esc(fmt(v))}${share}`;
              g.addEventListener('mouseenter', () => tip.show(x + w / 2, top, tipHtml));
              g.addEventListener('mouseleave', () => tip.hide());
              if (stacked) base[i] = v1;
              put(reg, labels[i], g); put(reg, se.id, g);
              animBars.push(g);
              (anchors[labels[i]] = anchors[labels[i]] || {})[se.id] = [x + w / 2, top];
            });
          });
        }
        (spec.marks || []).forEach((m) => {
          const at = anchors[m.label] || {};
          const p = (m.series && at[m.series]) || Object.values(at).sort((a, b) => a[1] - b[1])[0];
          if (!p) { report(`mark "${m.id}" points at a label that is not in the chart: ${m.label}`); return; }
          const tipM = h('div', 'u-mark', md(m.text));
          tipM.style.left = `${Math.max(90, Math.min(W - 90, p[0]))}px`;
          tipM.style.top = `${p[1]}px`;
          tipM.dataset.dim = 'no';
          box.appendChild(tipM);
          put(reg, m.id, tipM);
        });
        reanimate = () => {
          document.documentElement.classList.remove('u-instant');
          animBars.forEach((b) => { if (!b.classList.contains('u-hid')) { b.classList.add('u-hid'); requestAnimationFrame(() => b.classList.remove('u-hid')); } });
          animPaths.forEach(({ el, len }) => {
            el.style.transition = 'none';
            el.style.strokeDasharray = String(len);
            el.style.strokeDashoffset = String(len);
            el.getBoundingClientRect();
            el.style.transition = '';
            el.style.strokeDashoffset = '0';
          });
        };
        missing(reg, steps);
        apply = stepper(reg, steps);
      }
      apply(Math.max(0, U.step));
    });
    replayHandlers.push((idx) => { reanimate(); apply(idx); });
    return (i) => apply(i);
  }
  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1e-9)))), f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  // ---------- diagram ----------
  function diagram(root, spec, steps) {
    const nodes = spec.nodes || [], edges = (spec.edges || []).map((e) => ({ ...e, id: e.id || `${e.from}>${e.to}` }));
    const layout = spec.layout || 'flow';
    if (spec.title) root.appendChild(h('div', 'u-title', esc(spec.title)));
    const box = h('div', 'u-dg');
    root.appendChild(box);
    const byId = {};
    nodes.forEach((n) => (byId[n.id] = n));
    edges.forEach((e) => { if (!byId[e.from] || !byId[e.to]) report(`edge ${e.id} joins a node that does not exist`); });
    let apply = () => {};
    let reanimate = () => {};
    sized(box, (W, H) => {
      box.innerHTML = '';
      const reg = {};
      const svg = U.svg(W, H, box);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const { pos, maxW } = place(nodes, edges, layout, W, H);
      const els = {};
      const edgeEls = [];
      nodes.forEach((n) => {
        const p = pos[n.id];
        const vertical = !!n.icon && (layout === 'down' || layout === 'tree' || layout === 'hub' || layout === 'cycle' || maxW < 150);
        const d = h('div', `u-node u-card${vertical ? ' v' : ''}`, `${n.icon ? U.iconHTML(n.icon, vertical ? 26 : 22) : ''}<span><b>${md(n.label)}</b>${n.text ? `<small>${md(n.text)}</small>` : ''}</span>`);
        d.style.left = `${p.x}px`;
        d.style.top = `${p.y}px`;
        d.style.maxWidth = `${maxW}px`;
        box.appendChild(d);
        els[n.id] = d;
        put(reg, n.id, d);
      });
      for (const id in els) {
        const r = els[id].getBoundingClientRect(), b = box.getBoundingClientRect();
        const l = r.left - b.left, t = r.top - b.top;
        if (l < 0) els[id].style.left = `${parseFloat(els[id].style.left) - l}px`;
        if (l + r.width > W) els[id].style.left = `${parseFloat(els[id].style.left) - (l + r.width - W)}px`;
        if (t < 0) els[id].style.top = `${parseFloat(els[id].style.top) - t}px`;
        if (t + r.height > H) els[id].style.top = `${parseFloat(els[id].style.top) - (t + r.height - H)}px`;
      }
      const b0 = box.getBoundingClientRect();
      const rect = (id) => { const r = els[id].getBoundingClientRect(); return { x: r.left - b0.left + r.width / 2, y: r.top - b0.top + r.height / 2, w: r.width / 2 + 6, h: r.height / 2 + 6 }; };
      const clip = (c, tx, ty) => {
        const dx = tx - c.x, dy = ty - c.y;
        const k = Math.min(Math.abs(dx) > 1e-6 ? c.w / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? c.h / Math.abs(dy) : Infinity);
        return [c.x + dx * k, c.y + dy * k];
      };
      edges.forEach((e) => {
        if (!els[e.from] || !els[e.to]) return;
        const a = rect(e.from), b = rect(e.to);
        const back = edges.some((o) => o.from === e.to && o.to === e.from);
        const bend = e.bend != null ? e.bend : layout === 'cycle' ? 0.18 : back ? 0.14 : 0;
        const [x1, y1] = clip(a, b.x, b.y), [x2, y2] = clip(b, a.x, a.y);
        const g = U.arrow(svg, x1, y1, x2, y2, { bend, dashed: e.dashed, both: e.both, class: 'u-edge' });
        const len = g.shaft && g.shaft.getTotalLength ? Math.ceil(g.shaft.getTotalLength()) : 0;
        if (len > 0) g.dataset.drawLen = String(len);
        if (e.label) {
          const t = U.text(g, g.mid.x, g.mid.y, e.label, { anchor: 'middle', class: 'u-elabel' });
          const bb = t.getBBox();
          const bg = U.el(g, 'rect', { x: bb.x - 6, y: bb.y - 2.5, width: bb.width + 12, height: bb.height + 5, rx: 6, fill: 'var(--bg)', stroke: 'var(--line)', 'stroke-width': 0.8 });
          g.insertBefore(bg, t);
        }
        put(reg, e.id, g);
        edgeEls.push({ e, g });
      });
      // interactive node hover highlights connected edges and neighbours
      nodes.forEach((n) => {
        const el = els[n.id];
        el.addEventListener('mouseenter', () => {
          const adj = new Set([n.id]);
          edgeEls.forEach(({ e, g }) => {
            const rel = e.from === n.id || e.to === n.id;
            if (rel) { adj.add(e.from); adj.add(e.to); }
            g.classList.toggle('u-hover-rel', rel);
            g.classList.toggle('u-hover-dim', !rel);
          });
          for (const id in els) {
            els[id].classList.toggle('u-hover-rel', adj.has(id));
            els[id].classList.toggle('u-hover-dim', !adj.has(id));
          }
        });
        el.addEventListener('mouseleave', () => {
          edgeEls.forEach(({ g }) => { g.classList.remove('u-hover-rel', 'u-hover-dim'); });
          for (const id in els) els[id].classList.remove('u-hover-rel', 'u-hover-dim');
        });
      });
      reanimate = () => {
        document.documentElement.classList.remove('u-instant');
        edgeEls.forEach(({ g }) => {
          if (!g.classList.contains('u-hid') && g.dataset.drawLen && g.shaft && !g.shaft.classList.contains('u-dash')) {
            const len = g.dataset.drawLen;
            g.shaft.style.transition = 'none';
            g.shaft.style.strokeDasharray = len;
            g.shaft.style.strokeDashoffset = len;
            g.shaft.getBoundingClientRect();
            g.shaft.style.transition = '';
            g.shaft.style.strokeDashoffset = '0';
          }
        });
      };
      missing(reg, steps);
      apply = stepper(reg, steps);
      apply(Math.max(0, U.step));
    });
    replayHandlers.push((idx) => { reanimate(); apply(idx); });
    return (i) => apply(i);
  }
  function place(nodes, edges, layout, W, H) {
    const pos = {};
    const px = Math.min(90, W * 0.12), py = Math.min(48, H * 0.1);
    const Wa = W - 2 * px, Ha = H - 2 * py;
    if (layout === 'free') {
      nodes.forEach((v) => (pos[v.id] = { x: px + ((v.x != null ? v.x : 50) / 100) * Wa, y: py + ((v.y != null ? v.y : 50) / 100) * Ha }));
      return { pos, maxW: Math.max(110, Math.min(190, Wa / 3.2)) };
    }
    if (layout === 'cycle' || layout === 'hub') {
      const ring = layout === 'hub' ? nodes.slice(1) : nodes;
      const ry = Ha / 2, rx = Math.min(Wa / 2, ry * 1.5);
      if (layout === 'hub' && nodes[0]) pos[nodes[0].id] = { x: W / 2, y: H / 2 };
      ring.forEach((v, k) => { const a = -Math.PI / 2 + (k / ring.length) * Math.PI * 2; pos[v.id] = { x: W / 2 + rx * Math.cos(a), y: H / 2 + ry * Math.sin(a) }; });
      const arc = (2 * Math.PI * Math.min(rx, ry)) / Math.max(3, ring.length);
      return { pos, maxW: Math.max(100, Math.min(180, arc * 0.8)) };
    }
    const out = {}, rank = {};
    nodes.forEach((v) => { out[v.id] = []; rank[v.id] = 0; });
    edges.forEach((e) => { if (out[e.from] && out[e.to] !== undefined) out[e.from].push(e.to); });
    const order = [], seen = {}, onStack = {}, back = new Set();
    const dfs = (u) => { seen[u] = 1; onStack[u] = 1; for (const w of out[u]) { if (onStack[w]) back.add(`${u}>${w}`); else if (!seen[w]) dfs(w); } onStack[u] = 0; order.push(u); };
    nodes.forEach((v) => { if (!seen[v.id]) dfs(v.id); });
    order.reverse().forEach((u) => out[u].forEach((w) => { if (!back.has(`${u}>${w}`)) rank[w] = Math.max(rank[w], rank[u] + 1); }));
    const layers = [];
    nodes.forEach((v) => (layers[rank[v.id]] = layers[rank[v.id]] || []).push(v.id));
    const L = layers.length, widest = Math.max(...layers.map((l) => l.length));
    if (layout === 'flow') {
      const per = widest > 1 ? L : Math.max(2, Math.min(L, Math.floor(Wa / 150) + 1));
      const rows = Math.ceil(L / per);
      const colW = per === 1 ? Wa : Wa / (per - 1), bandH = Ha / rows;
      layers.forEach((ids, r) => ids.forEach((id, k) => {
        const row = Math.floor(r / per), col = r % per;
        const inRow = Math.min(per, L - row * per);
        const x = inRow === 1 ? W / 2 : px + (col + (per - inRow) / 2) * colW;
        const y = py + bandH * (row + (ids.length === 1 ? 0.5 : (k + 0.5) / ids.length));
        pos[id] = { x, y };
      }));
      return { pos, maxW: Math.max(96, Math.min(190, colW * 0.86)) };
    }
    const rowH = L === 1 ? Ha : Ha / (L - 1);
    const gap = Math.min(220, Wa / Math.max(1, widest - 1));
    const maxW = Math.max(96, Math.min(190, gap * 0.86));
    const xs = {};
    const spread = (ids) => ids.forEach((id, k) => (xs[id] = (k - (ids.length - 1) / 2) * gap));
    spread(layers[L - 1]);
    for (let r = L - 2; r >= 0; r--) {
      const ids = layers[r];
      const kids = (id) => out[id].filter((w) => rank[w] === r + 1 && !back.has(`${id}>${w}`));
      const fixed = ids.filter((id) => kids(id).length);
      fixed.forEach((id) => { const k = kids(id); xs[id] = k.reduce((a, w) => a + xs[w], 0) / k.length; });
      if (!fixed.length) { spread(ids); continue; }
      let edge = Math.max(...fixed.map((id) => xs[id]));
      ids.filter((id) => !kids(id).length).forEach((id) => (xs[id] = edge += gap));
      const sorted = [...ids].sort((a, b) => xs[a] - xs[b]);
      for (let k = 1; k < sorted.length; k++) xs[sorted[k]] = Math.max(xs[sorted[k]], xs[sorted[k - 1]] + gap);
    }
    const all = Object.values(xs), lo = Math.min(...all), hi = Math.max(...all);
    const k = hi - lo > Wa ? Wa / (hi - lo) : 1;
    layers.forEach((ids, r) => ids.forEach((id) => {
      pos[id] = { x: W / 2 + (xs[id] - (lo + hi) / 2) * k, y: L === 1 ? H / 2 : py + r * rowH };
    }));
    return { pos, maxW: Math.max(96, Math.min(maxW, gap * k * 0.86)) };
  }

  // ---------- timeline ----------
  function timeline(root, spec, steps) {
    const evs = spec.events || [];
    if (spec.title) root.appendChild(h('div', 'u-title', esc(spec.title)));
    const box = h('div', 'u-tl');
    root.appendChild(box);
    let apply = () => {};
    sized(box, (W, H) => {
      box.innerHTML = '<div class="axis"></div><div class="u-axis-fill"></div>';
      const fill = box.querySelector('.u-axis-fill');
      const reg = {};
      const n = evs.length, pad = Math.min(90, W / (n * 2));
      const nums = evs.map((e) => (typeof e.at === 'number' ? e.at : null));
      const even = (k) => (n === 1 ? 0.5 : k / (n - 1));
      const cardW = Math.min(176, Math.max(96, ((W - 2 * pad) / Math.max(1, n - 1)) * 2 - 16));
      let scaled = nums.every((v) => v != null) && n > 1 && nums[n - 1] > nums[0];
      if (scaled) for (let k = 2; k < n; k++) if (((nums[k] - nums[k - 2]) / (nums[n - 1] - nums[0])) * (W - 2 * pad) < cardW + 8) scaled = false;
      const xOf = (k) => pad + (scaled ? (nums[k] - nums[0]) / (nums[n - 1] - nums[0]) : even(k)) * (W - 2 * pad);
      const idx = {};
      evs.forEach((e, k) => (idx[e.id] = k));
      (spec.spans || []).forEach((sp) => {
        if (!(sp.from in idx) || !(sp.to in idx)) { report(`span ${sp.id} names an event that does not exist`); return; }
        const a = xOf(idx[sp.from]), b = xOf(idx[sp.to]);
        const d = h('div', 'u-span', sp.label ? `<em>${esc(sp.label)}</em>` : '');
        d.style.left = `${Math.min(a, b)}px`; d.style.width = `${Math.abs(b - a)}px`;
        box.appendChild(d);
        put(reg, sp.id, d);
      });
      evs.forEach((e, k) => {
        const up = k % 2 === 0, gap = Math.min(46, H * 0.12);
        const d = h('div', `u-ev ${up ? 'up' : 'dn'}`);
        d.style.left = `${xOf(k)}px`;
        d.innerHTML = `<div class="stem" style="${up ? `bottom:0;height:${gap}px` : `top:0;height:${gap}px`}"></div><div class="dot"></div>`;
        const c = h('div', 'u-card', `<div class="when">${e.icon ? U.iconHTML(e.icon, 15) : ''}${esc(e.when)}</div><b>${md(e.title)}</b>${e.text ? `<small>${md(e.text)}</small>` : ''}`);
        c.style.width = `${cardW}px`;
        c.style[up ? 'bottom' : 'top'] = `${gap}px`;
        const left = xOf(k) - cardW / 2;
        if (left < 0) c.style.setProperty('--tx', `calc(-50% + ${-left}px)`);
        if (left + cardW > W) c.style.setProperty('--tx', `calc(-50% - ${left + cardW - W}px)`);
        d.appendChild(c);
        box.appendChild(d);
        put(reg, e.id, d);
      });
      missing(reg, steps);
      apply = stepper(reg, steps, (_, focus) => {
        const focusedXs = evs.filter((e) => focus.has(e.id)).map((e) => xOf(idx[e.id]));
        const shownXs = evs.filter((e) => reg[e.id] && !reg[e.id][0].classList.contains('u-hid')).map((e) => xOf(idx[e.id]));
        const xs = focusedXs.length ? [Math.min(...shownXs, ...focusedXs), Math.max(...focusedXs)] : shownXs.length > 1 ? [Math.min(...shownXs), Math.max(...shownXs)] : null;
        if (xs && xs[1] > xs[0]) { fill.style.left = `${xs[0]}px`; fill.style.width = `${xs[1] - xs[0]}px`; fill.style.opacity = '1'; }
        else { fill.style.opacity = '0'; }
      });
      apply(Math.max(0, U.step));
    });
    return (i) => apply(i);
  }

  // ---------- compare ----------
  function compare(root, spec, steps) {
    const cols = spec.columns || [], rows = spec.rows || [];
    if (spec.title) root.appendChild(h('div', 'u-title', esc(spec.title)));
    const reg = {};
    const g = h('div', 'u-cmp');
    g.style.gridTemplateColumns = `minmax(64px,auto) repeat(${cols.length}, minmax(0,1fr))`;
    g.style.columnGap = '12px';
    root.appendChild(g);
    cols.forEach((c, k) => {
      const bg = h('div', 'col');
      bg.style.gridColumn = `${k + 2}`; bg.style.gridRow = `1 / span ${rows.length + 1}`;
      g.appendChild(bg);
      put(reg, c.id, bg); bg.dataset.dim = 'no';
    });
    cols.forEach((c, k) => {
      const hd = h('div', 'h', `${c.icon ? U.iconHTML(c.icon, 20) : ''}${esc(c.title)}`);
      hd.style.gridColumn = `${k + 2}`; hd.style.gridRow = '1';
      g.appendChild(hd);
      put(reg, c.id, hd);
    });
    const rowEls = [];
    rows.forEach((r, i) => {
      const group = [];
      const rl = h('div', 'rl', md(r.label));
      rl.style.gridRow = `${i + 2}`; rl.style.gridColumn = '1';
      g.appendChild(rl);
      put(reg, r.id, rl);
      group.push(rl);
      cols.forEach((c, k) => {
        const cell = h('div', 'c', md((r.cells || [])[k] || ''));
        cell.style.gridRow = `${i + 2}`; cell.style.gridColumn = `${k + 2}`;
        cell.style.transitionDelay = `${Math.min(i * 30 + k * 20, 180)}ms`;
        g.appendChild(cell);
        put(reg, r.id, cell); put(reg, c.id, cell);
        put(reg, `${r.id}.${c.id}`, cell);
        group.push(cell);
      });
      group.forEach((el) => {
        el.addEventListener('mouseenter', () => group.forEach((x) => x.classList.add('u-row-hover')));
        el.addEventListener('mouseleave', () => group.forEach((x) => x.classList.remove('u-row-hover')));
      });
      rowEls.push(group);
    });
    missing(reg, steps);
    return stepper(reg, steps);
  }

  // ---------- points ----------
  function points(root, spec, steps) {
    const items = spec.items || [];
    const reg = {};
    if (spec.title) root.appendChild(h('div', 'u-title', esc(spec.title)));
    const g = h('div', 'u-pts');
    const cols = items.length <= 3 ? 1 : items.length === 4 ? 2 : items.length <= 6 ? 2 : 3;
    g.style.gridTemplateColumns = `repeat(${cols}, minmax(0,1fr))`;
    if (spec.center) g.appendChild(Object.assign(h('div', 'u-center', md(spec.center)), { style: `grid-column:1/-1` }));
    items.forEach((it, idx) => {
      const c = h('div', 'u-pt u-card', `${it.icon ? `<span class="ib">${U.iconHTML(it.icon, 20)}</span>` : ''}<span><b>${md(it.title)}</b>${it.text ? `<small>${md(it.text)}</small>` : ''}</span>`);
      c.style.transitionDelay = `${Math.min(idx * 45, 220)}ms`;
      g.appendChild(c);
      put(reg, it.id, c);
    });
    root.appendChild(g);
    missing(reg, steps);
    return stepper(reg, steps);
  }

  // ---------- passage ----------
  function passage(root, spec, steps) {
    const reg = {};
    const notes = {};
    (spec.notes || []).forEach((n) => (notes[n.id] = n.text));
    const plain = String(spec.text || '').replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
    const wrap = h('div', `u-ps${plain.length > 120 && (spec.notes || []).length ? ' side' : ''}`);
    const txt = h('div', `txt${plain.length > 90 ? ' long' : ''}`);
    if (plain.length > 240) txt.style.fontSize = '14.5px';
    const spans = {};
    txt.innerHTML = esc(spec.text || '').replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_, id, t) => `<span class="u-hl" data-id="${id.trim()}">${t}</span>`).replace(/\n/g, '<br>');
    txt.querySelectorAll('.u-hl').forEach((s) => { const id = s.dataset.id; spans[id] = s; put(reg, id, s); s.dataset.dim = 'no'; });
    wrap.appendChild(txt);
    if (spec.source) wrap.appendChild(h('div', 'src', esc(spec.source)));
    const nb = h('div', 'u-notes');
    wrap.appendChild(nb);
    root.appendChild(wrap);
    for (const id in notes) if (!spans[id]) report(`note "${id}" has no [[${id}|...]] span in the text`);
    const firstAt = {};
    (steps || []).forEach((s, i) => [...(s.reveal || []), ...(s.focus || [])].forEach((id) => { if (!(id in firstAt)) firstAt[id] = i; }));
    let pinned = null;
    let curStep = 0;
    const renderNotes = (ids) => {
      nb.innerHTML = '';
      ids.filter((id) => notes[id]).forEach((id) => {
        nb.appendChild(h('div', 'u-note u-card', `<q>${spans[id] ? spans[id].textContent : ''}</q><span>${md(notes[id])}</span>`));
      });
    };
    const render = () => {
      const focus = (steps && steps[curStep] && steps[curStep].focus) || [];
      for (const id in spans) {
        const revealed = id in firstAt && curStep >= firstAt[id];
        spans[id].classList.toggle('on', revealed);
        spans[id].classList.toggle('u-focus', focus.includes(id));
        spans[id].classList.toggle('u-pin', pinned === id);
        if (revealed && notes[id]) spans[id].setAttribute('tabindex', '0'); else spans[id].removeAttribute('tabindex');
      }
      renderNotes(pinned ? [pinned] : focus);
    };
    for (const id in spans) {
      const toggle = () => {
        if (!spans[id].classList.contains('on') || !notes[id]) return;
        pinned = pinned === id ? null : id;
        render();
      };
      spans[id].addEventListener('click', toggle);
      spans[id].addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } });
    }
    const apply = (i) => { curStep = i; pinned = null; render(); };
    const bad = new Set();
    (steps || []).forEach((s) => [...(s.reveal || []), ...(s.focus || [])].forEach((id) => { if (!spans[id]) bad.add(id); }));
    if (bad.size) report(`steps name spans that are not in the text: ${[...bad].join(', ')}`);
    return apply;
  }

  // ---------- code walkthrough ----------
  const CODE_KW = /^(def|return|if|elif|else|for|while|in|and|or|not|class|import|from|as|try|except|with|yield|lambda|pass|break|continue|True|False|None|function|const|let|var|new|switch|case|default|async|await|true|false|null|undefined|int|float|double|char|void|bool|struct|public|private|static|fn|mut|pub|match|loop|enum|impl|struct)$/;
  function highlightCode(line) {
    const out = [];
    const re = /(#.*$|\/\/.*$|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(esc(line.slice(last, m.index)));
      const tok = m[0];
      if (tok.startsWith('#') || tok.startsWith('//')) out.push(`<span class="u-tok-cm">${esc(tok)}</span>`);
      else if (tok.startsWith('"') || tok.startsWith("'")) out.push(`<span class="u-tok-str">${esc(tok)}</span>`);
      else if (/^\d/.test(tok)) out.push(`<span class="u-tok-num">${esc(tok)}</span>`);
      else if (CODE_KW.test(tok)) out.push(`<span class="u-tok-kw">${esc(tok)}</span>`);
      else out.push(esc(tok));
      last = m.index + tok.length;
    }
    if (last < line.length) out.push(esc(line.slice(last)));
    return out.join('');
  }
  function code(root, spec, steps) {
    const lines = spec.lines || [];
    const states = spec.states || [];
    const byId = {};
    states.forEach((st, idx) => (byId[st.id] = idx));
    const bad = new Set();
    (steps || []).forEach((s) => [...(s.reveal || []), ...(s.focus || [])].forEach((id) => { if (!(id in byId)) bad.add(id); }));
    if (bad.size) report(`steps name code states that do not exist: ${[...bad].join(', ')}`);

    const wrap = h('div', 'u-code-wrap');
    const left = h('div', 'u-code-pane');
    const hd = h('div', 'u-pane-hd', `<b>${esc(spec.title || '程式追蹤')}</b>${spec.language ? `<span class="u-lang">${esc(spec.language)}</span>` : ''}`);
    const src = h('div', 'u-code-src');
    const lineEls = lines.map((ln, idx) => {
      const row = h('div', 'u-cline', `<span class="no">${idx + 1}</span><span>${highlightCode(ln)}</span>`);
      src.appendChild(row);
      return row;
    });
    const noteBar = h('div', 'u-code-note');
    noteBar.style.display = 'none';
    left.appendChild(hd);
    left.appendChild(src);
    left.appendChild(noteBar);

    const right = h('div', 'u-vars-pane');
    const rhd = h('div', 'u-pane-hd', `<b>變數狀態</b><span class="u-stidx"></span>`);
    const stIdxLbl = rhd.querySelector('.u-stidx');
    const varsBody = h('div', 'u-vars-body');
    const outBox = h('div', 'u-out');
    outBox.style.display = 'none';
    const stateBar = h('div', 'u-state-bar');
    right.appendChild(rhd);
    right.appendChild(varsBody);
    right.appendChild(outBox);
    if (states.length > 1) right.appendChild(stateBar);

    wrap.appendChild(left);
    wrap.appendChild(right);
    root.appendChild(wrap);

    let activeIdx = 0;
    let prevVars = {};
    const stBtns = states.map((st, idx) => {
      const b = h('button', 'u-stbtn', `#${idx + 1}`);
      b.type = 'button';
      b.addEventListener('click', () => showState(idx, activeIdx));
      stateBar.appendChild(b);
      return b;
    });

    const showState = (idx, fromIdx) => {
      if (!states.length) return;
      const clamped = Math.max(0, Math.min(states.length - 1, idx));
      const st = states[clamped];
      const prev = fromIdx != null && fromIdx >= 0 && fromIdx < states.length && fromIdx !== clamped ? (states[fromIdx].vars || {}) : prevVars;
      activeIdx = clamped;
      const hlSet = new Set(st.lines || []);
      let firstHl = null;
      lineEls.forEach((el, k) => {
        const on = hlSet.has(k + 1);
        el.classList.toggle('hl', on);
        if (on && !firstHl) firstHl = el;
      });
      if (firstHl && firstHl.scrollIntoView) firstHl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (st.note) { noteBar.style.display = ''; noteBar.innerHTML = md(st.note); }
      else { noteBar.style.display = 'none'; }
      stIdxLbl.textContent = states.length > 1 ? `${clamped + 1} / ${states.length}` : '';
      stBtns.forEach((b, k) => b.classList.toggle('on', k === clamped));
      const vars = st.vars || {};
      const keys = Object.keys(vars);
      varsBody.innerHTML = '';
      if (!keys.length) {
        varsBody.appendChild(h('div', 'u-vempty', '這一步沒有變數更新'));
      } else {
        keys.forEach((k) => {
          const val = String(vars[k]);
          const old = prev[k] != null ? String(prev[k]) : null;
          const changed = old !== null && old !== val;
          const row = h('div', `u-vrow${changed ? ' changed' : ''}`, `<span class="vk">${esc(k)}</span><span class="vv">${changed ? `<span class="vprev">${esc(old)}</span>` : ''}${esc(val)}</span>`);
          varsBody.appendChild(row);
        });
      }
      prevVars = { ...vars };
      if (st.output) {
        outBox.style.display = '';
        outBox.innerHTML = `<div class="u-out-lbl">輸出</div><pre>${esc(st.output)}</pre>`;
      } else {
        outBox.style.display = 'none';
      }
    };

    const resolveStep = (i) => {
      const s = steps && steps[i];
      const focus = (s && s.focus) || [];
      for (let k = focus.length - 1; k >= 0; k--) if (focus[k] in byId) return byId[focus[k]];
      const rev = (s && s.reveal) || [];
      for (let k = rev.length - 1; k >= 0; k--) if (rev[k] in byId) return byId[rev[k]];
      return Math.min(i, Math.max(0, states.length - 1));
    };

    const apply = (i) => {
      const target = resolveStep(i);
      const prevIdx = i > 0 ? resolveStep(i - 1) : -1;
      showState(target, prevIdx);
    };
    replayHandlers.push((idx) => {
      const target = resolveStep(idx);
      const prevIdx = idx > 0 ? resolveStep(idx - 1) : -1;
      showState(target, prevIdx);
    });
    return apply;
  }

  // ---------- interactive quiz ----------
  function quiz(root, spec, steps) {
    const qs = spec.questions || [];
    const byId = {};
    qs.forEach((q, idx) => (byId[q.id] = idx));
    const bad = new Set();
    (steps || []).forEach((s) => [...(s.reveal || []), ...(s.focus || [])].forEach((id) => { if (!(id in byId)) bad.add(id); }));
    if (bad.size) report(`steps name quiz questions that do not exist: ${[...bad].join(', ')}`);

    if (spec.title) root.appendChild(h('div', 'u-title', esc(spec.title)));
    const wrap = h('div', 'u-quiz');
    const box = h('div', 'u-qbox');
    wrap.appendChild(box);
    root.appendChild(wrap);

    const state = qs.map(() => ({ picked: new Set(), checked: false, ok: false, hint: false }));
    let cur = 0;
    const LETTERS = 'ABCDEFGH';

    const render = () => {
      box.innerHTML = '';
      if (!qs.length) return;
      const q = qs[cur];
      const st = state[cur];
      const multi = (q.answer || []).length > 1;
      const ansSet = new Set(q.answer || []);

      if (qs.length > 1) {
        const nav = h('div', 'u-qnav');
        const tabs = h('div', 'u-qtabs');
        qs.forEach((_, k) => {
          const s = state[k];
          const cls = `u-qtab${k === cur ? ' on' : ''}${s.checked ? (s.ok ? ' ok' : ' no') : ''}`;
          const b = h('button', cls, `第 ${k + 1} 題`);
          b.type = 'button';
          b.addEventListener('click', () => { cur = k; render(); });
          tabs.appendChild(b);
        });
        const done = state.filter((s) => s.checked).length;
        const rightCount = state.filter((s) => s.checked && s.ok).length;
        const score = h('span', 'u-qscore', done ? `已答對 ${rightCount} / ${qs.length}` : `共 ${qs.length} 題`);
        nav.appendChild(tabs);
        nav.appendChild(score);
        box.appendChild(nav);
      }

      const card = h('div', 'u-card u-qcard');
      card.appendChild(h('div', 'u-qprompt', `${md(q.prompt)}${multi ? '<span class="u-qmulti">可複選</span>' : ''}`));

      const list = h('div', 'u-qlist');
      (q.options || []).forEach((opt, oi) => {
        const picked = st.picked.has(oi);
        const correct = ansSet.has(oi);
        let cls = 'u-qopt';
        let tag = '';
        if (st.checked) {
          if (picked && correct) { cls += ' ok'; tag = '正確'; }
          else if (picked && !correct) { cls += ' no'; tag = '不對'; }
          else if (!picked && correct) { cls += ' missed'; tag = '正解'; }
        } else if (picked) {
          cls += ' sel';
        }
        const btn = h('button', cls, `<span class="key">${LETTERS[oi] || oi + 1}</span><span>${md(opt)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}`);
        btn.type = 'button';
        btn.disabled = st.checked;
        btn.addEventListener('click', () => {
          if (multi) { if (st.picked.has(oi)) st.picked.delete(oi); else st.picked.add(oi); }
          else { st.picked.clear(); st.picked.add(oi); }
          render();
        });
        list.appendChild(btn);
      });
      card.appendChild(list);

      if (st.hint && q.hint && !st.checked) {
        card.appendChild(h('div', 'u-qhint', `提示：${md(q.hint)}`));
      }

      const act = h('div', 'u-qact');
      if (!st.checked) {
        const checkBtn = h('button', 'u-qbtn pri', '檢查答案');
        checkBtn.type = 'button';
        checkBtn.disabled = st.picked.size === 0;
        checkBtn.addEventListener('click', () => {
          st.checked = true;
          st.ok = st.picked.size === ansSet.size && [...ansSet].every((x) => st.picked.has(x));
          render();
        });
        act.appendChild(checkBtn);
        if (q.hint && !st.hint) {
          const hintBtn = h('button', 'u-qbtn ghost', '看提示');
          hintBtn.type = 'button';
          hintBtn.addEventListener('click', () => { st.hint = true; render(); });
          act.appendChild(hintBtn);
        }
      } else {
        const retryBtn = h('button', 'u-qbtn ghost', '再試一次');
        retryBtn.type = 'button';
        retryBtn.addEventListener('click', () => {
          st.picked.clear(); st.checked = false; st.ok = false;
          render();
        });
        act.appendChild(retryBtn);
        if (cur < qs.length - 1) {
          const nextBtn = h('button', 'u-qbtn pri', '下一題');
          nextBtn.type = 'button';
          nextBtn.addEventListener('click', () => { cur += 1; render(); });
          act.appendChild(nextBtn);
        }
      }
      card.appendChild(act);

      if (st.checked && q.explanation) {
        card.appendChild(h('div', `u-qexp${st.ok ? '' : ' bad'}`, `<b>${st.ok ? '答對了' : '再看一眼'}</b>${md(q.explanation)}`));
      }
      box.appendChild(card);
    };

    const apply = (i) => {
      const s = steps && steps[i];
      const ids = [...((s && s.focus) || []), ...((s && s.reveal) || [])];
      for (let k = ids.length - 1; k >= 0; k--) {
        if (ids[k] in byId) { cur = byId[ids[k]]; break; }
      }
      if (!ids.length && qs.length) cur = Math.min(i, qs.length - 1);
      render();
    };
    return apply;
  }

  const KINDS = { chart, diagram, timeline, compare, points, passage, code, quiz };
  /** Mounts a declarative visual into `parent` (default: the whole frame) and drives it by the steps. */
  U.mount = (kind, spec, steps, parent) => {
    const make = KINDS[kind];
    if (!make) { report(`unknown visual kind "${kind}"`); return; }
    const root = h('div', 'u-root');
    (parent || document.body).appendChild(root);
    const apply = safe(make, root, spec || {}, steps || []);
    if (apply) U.onStep((i) => apply(i));
    return root;
  };
  U.kinds = Object.keys(KINDS);
})();
