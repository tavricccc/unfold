// The kit every lesson visual runs with, inside its sandboxed frame. It is loaded before the
// visual's own markup and gives it `U`:
//   - steps:     U.onStep((index, animate) => ...), called for step 0 on load and on every change
//   - motion:    U.tween(ms, t => ...), U.lerp, U.ease; a new step finishes running tweens first
//   - drawing:   U.svg, U.el, U.text, U.icon, U.iconHTML, U.arrow
//   - visuals:   U.mount(kind, spec, steps) for chart, diagram, timeline, compare, points, passage,
//                each element revealed and focused by the steps' "reveal" and "focus" ids
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

  // ---------- steps ----------
  const handlers = [];
  U.step = -1;
  U.onStep = (fn) => { handlers.push(fn); if (U.step >= 0) safe(fn, U.step, false); };
  const go = (index, animate) => {
    U.finish();
    U.step = index;
    document.documentElement.classList.toggle('u-instant', !animate);
    handlers.forEach((h) => safe(h, index, animate));
  };
  addEventListener('message', (e) => { const d = e.data; if (d && d.type === 'step') go(d.index | 0, !!d.animate); });
  addEventListener('DOMContentLoaded', () => {
    // a lone capped svg sits in the middle of the stage rather than at its top
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
    // a small canvas on a large stage would scale its 14px labels to 30px and more
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
    // end direction: from the control point to the tip
    const ex = x2 - cx, ey = y2 - cy, el = Math.hypot(ex, ey) || 1, ux = ex / el, uy = ey / el;
    const bx = x2 - ux * head * 0.9, by = y2 - uy * head * 0.9;
    U.el(g, 'path', { d: o.bend ? `M${x1} ${y1}Q${cx} ${cy} ${bx} ${by}` : `M${x1} ${y1}L${bx} ${by}`, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': o.dashed ? '5 5' : null });
    const hx = -uy, hy = ux;
    U.el(g, 'path', { d: `M${x2} ${y2}L${x2 - ux * head + hx * head * 0.55} ${y2 - uy * head + hy * head * 0.55}L${x2 - ux * head - hx * head * 0.55} ${y2 - uy * head - hy * head * 0.55}z`, fill: color, stroke: color, 'stroke-width': 1, 'stroke-linejoin': 'round' });
    if (o.both) U.el(g, 'path', { d: `M${x1} ${y1}L${x1 + ux * head - hx * head * 0.55} ${y1 + uy * head - hy * head * 0.55}L${x1 + ux * head + hx * head * 0.55} ${y1 + uy * head + hy * head * 0.55}z`, fill: color });
    g.mid = { x: (x1 + 2 * cx + x2) / 4, y: (y1 + 2 * cy + y2) / 4 };
    return g;
  };

  // ---------- styles ----------
  const css = `
  .u-svg{display:block;width:100%;height:100%;overflow:visible}
  .u-root{position:absolute;inset:0;display:flex;flex-direction:column;padding:20px 24px;box-sizing:border-box;gap:14px}
  .u-title{font-size:13px;color:var(--fg-2);font-weight:500;text-align:center}
  .u-ic{flex:none;display:block}
  [data-u]{transition:opacity .5s ease,transform .6s cubic-bezier(.2,.7,.2,1),color .35s,background-color .35s,box-shadow .35s,fill .35s,stroke .35s}
  .u-instant [data-u],.u-instant [data-u] *{transition:none!important}
  .u-hid{opacity:0!important;pointer-events:none}
  .u-dim{opacity:.38}
  .u-card{background:var(--raise,var(--bg));border-radius:12px;box-shadow:0 0 0 1px var(--line);color:var(--fg)}
  .u-focus.u-card,.u-card.u-focus{box-shadow:0 0 0 1.5px var(--acc),0 6px 18px -8px color-mix(in srgb,var(--acc) 45%,transparent)}
  .u-focus .u-ic{color:var(--acc)}
  /* diagram */
  .u-dg{position:relative;flex:1;min-height:0}
  .u-dg>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .u-node{position:absolute;transform:translate(-50%,-50%);width:max-content;display:flex;align-items:center;gap:9px;padding:9px 13px;max-width:190px;box-sizing:border-box;font-size:14px;line-height:1.35}
  .u-node.v{flex-direction:column;text-align:center;gap:5px;padding:11px 13px}
  .u-node b{font-weight:600;display:block}
  .u-node small{display:block;color:var(--fg-2);font-size:12px;margin-top:2px}
  .u-elabel{font-size:12px;fill:var(--fg-2)}
  .u-edge.u-focus path{stroke:var(--acc)!important;fill:var(--acc)}
  .u-edge.u-focus path:first-child{fill:none}
  .u-edge.u-focus text{fill:var(--acc)}
  /* chart */
  .u-ch{flex:1;min-height:0;position:relative}
  .u-legend{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--fg-2)}
  .u-legend span{display:inline-flex;align-items:center;gap:6px}
  .u-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
  .u-axis{stroke:var(--line);stroke-width:1}
  .u-tick{font-size:11.5px;fill:var(--fg-3)}
  .u-lab{font-size:12.5px;fill:var(--fg-2)}
  .u-val{font-size:12px;fill:var(--fg-2);font-variant-numeric:tabular-nums}
  .u-bar{transform-box:fill-box;transform-origin:50% 100%}
  .u-bar.u-hid{opacity:1!important;transform:scaleY(0)}
  .u-focus .u-lab,.u-lab.u-focus{fill:var(--fg);font-weight:600}
  .u-mark{position:absolute;transform:translate(-50%,calc(-100% - 12px));background:var(--fg);color:var(--bg);font-size:12.5px;line-height:1.4;padding:6px 10px;border-radius:8px;max-width:200px;width:max-content;text-align:center}
  .u-mark::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:var(--fg)}
  .u-mark.u-hid{transform:translate(-50%,calc(-100% - 4px))}
  /* timeline */
  .u-tl{flex:1;position:relative;min-height:0}
  .u-tl .axis{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:var(--line)}
  .u-span{position:absolute;top:50%;height:8px;margin-top:-4px;border-radius:4px;background:var(--acc-soft)}
  .u-span em{position:absolute;left:50%;top:12px;transform:translateX(-50%);font-style:normal;font-size:12px;color:var(--fg-2);white-space:nowrap}
  .u-span.u-focus{background:var(--acc)}
  .u-ev{position:absolute;width:0;top:50%}
  .u-ev .dot{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;background:var(--bg);box-shadow:inset 0 0 0 2px var(--fg-3)}
  .u-ev.u-focus .dot{box-shadow:inset 0 0 0 6px var(--acc)}
  .u-ev .stem{position:absolute;left:-.5px;width:1px;background:var(--line)}
  .u-ev .u-card{position:absolute;left:0;transform:translateX(-50%);padding:9px 12px;font-size:13px;line-height:1.4;box-sizing:border-box}
  .u-ev .when{font-size:12px;color:var(--fg-3);font-variant-numeric:tabular-nums;margin-bottom:2px;display:flex;align-items:center;gap:6px}
  .u-ev.u-focus .when{color:var(--acc)}
  .u-ev b{font-weight:600;display:block}
  .u-ev small{display:block;color:var(--fg-2);font-size:12px;margin-top:3px}
  /* compare */
  .u-cmp{flex:1;min-height:0;display:grid;align-content:center;gap:0;font-size:14px;line-height:1.5}
  .u-cmp .h{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;padding:10px 12px;border-radius:10px 10px 0 0}
  .u-cmp .rl{color:var(--fg-2);font-size:13px;padding:11px 12px 11px 0;display:flex;align-items:center}
  .u-cmp .c{padding:11px 14px;border-top:1px solid var(--line)}
  .u-cmp .col{background:var(--raise,var(--bg));box-shadow:0 0 0 1px var(--line);border-radius:12px}
  .u-cmp .c.u-focus,.u-cmp .rl.u-focus{color:var(--fg);font-weight:500}
  .u-cmp .c.u-focus{background:var(--acc-soft)}
  /* points */
  .u-pts{flex:1;min-height:0;display:grid;gap:12px;align-content:center}
  .u-pt{padding:14px 16px;display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.5}
  .u-pt .ib{width:36px;height:36px;border-radius:10px;background:var(--sub);display:grid;place-items:center;flex:none;color:var(--fg-2)}
  .u-pt.u-focus .ib{background:var(--acc-soft);color:var(--acc)}
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
  .u-hl{border-radius:4px;padding:1px 2px;margin:0 -2px;background-image:linear-gradient(var(--acc-soft),var(--acc-soft));background-size:100% 0;background-repeat:no-repeat;background-position:0 100%;transition:background-size .5s,color .3s}
  .u-hl.on{background-size:100% 38%}
  .u-hl.u-focus{background-size:100% 100%;color:var(--fg)}
  .u-notes{display:flex;flex-direction:column;gap:8px;min-height:64px}
  .u-note{padding:10px 14px;font-size:14px;line-height:1.55;display:flex;gap:10px}
  .u-note q{quotes:none;font-weight:600;color:var(--acc);white-space:nowrap}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- reveal and focus ----------
  /** Hides each id until the first step that reveals it, and highlights the ids a step focuses. */
  function stepper(reg, steps, after) {
    const firstAt = {};
    (steps || []).forEach((s, i) => (s && s.reveal || []).forEach((id) => { if (!(id in firstAt)) firstAt[id] = i; }));
    const apply = (i) => {
      const focus = new Set((steps && steps[i] && steps[i].focus) || []);
      const any = [...focus].some((id) => reg[id]);
      for (const id in reg) {
        const shown = !(id in firstAt) || i >= firstAt[id];
        for (const n of reg[id]) {
          n.classList.toggle('u-hid', !shown);
          n.classList.toggle('u-focus', focus.has(id));
          if (n.dataset.dim !== 'no') n.classList.toggle('u-dim', any && shown && !focus.has(id) && !n.dataset.keep);
        }
      }
      if (after) after(i, focus);
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
  const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  /** Redraws on every resize; the step state is reapplied after each draw. */
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

  // ---------- chart ----------
  function chart(root, spec, steps) {
    const series = spec.series || [];
    const labels = spec.labels || [];
    const type = spec.type || 'bar';
    if (spec.title) root.appendChild(h('div', 'u-title', esc(spec.title)));
    const box = h('div', 'u-ch');
    root.appendChild(box);
    const palette = (k) => (k === 0 ? 'var(--acc)' : ['var(--fg-2)', 'var(--fg-3)', 'color-mix(in srgb,var(--acc) 45%,var(--bg))', 'var(--line)'][(k - 1) % 4]);
    if (type !== 'pie' && series.length > 1) {
      const lg = h('div', 'u-legend');
      series.forEach((s, k) => { const it = h('span', null, `<i style="background:${palette(k)}"></i>${esc(s.name || s.id)}`); lg.appendChild(it); });
      root.appendChild(lg);
    }
    let apply = () => {};
    const unit = spec.unit ? ` ${spec.unit}` : '';
    const fmt = (v) => (Math.abs(v) >= 1000 ? v.toLocaleString() : String(Math.round(v * 100) / 100)) + unit;
    sized(box, (W, H) => {
      box.innerHTML = '';
      const reg = {};
      const s = U.svg(W, H, box);
      if (type === 'pie') {
        const vals = (series[0] && series[0].values) || [];
        const tot = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
        const r = Math.min(W * 0.36, H / 2 - 16), cx = W / 2 - (W > 420 ? r * 0.55 : 0), cy = H / 2;
        let a0 = -Math.PI / 2;
        vals.forEach((v, k) => {
          const a1 = a0 + (Math.max(0, v) / tot) * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0, ri = r * 0.58;
          const p = (a, rr) => `${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}`;
          const g = U.el(s, 'g', {});
          U.el(g, 'path', { d: `M${p(a0, r)}A${r} ${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, ri)}A${ri} ${ri} 0 ${large} 0 ${p(a0, ri)}z`, fill: palette(k), stroke: 'var(--bg)', 'stroke-width': 2 });
          const lx = W > 420 ? cx + r + 28 : cx - r, ly = W > 420 ? cy - (vals.length - 1) * 13 + k * 26 : cy + r + 18 + k * 20;
          U.el(g, 'rect', { x: lx, y: ly - 5, width: 10, height: 10, rx: 3, fill: palette(k) });
          U.text(g, lx + 18, ly, `${labels[k] || ''}  ${Math.round((Math.max(0, v) / tot) * 1000) / 10}%`, { anchor: 'start', size: 13, class: 'u-lab' });
          put(reg, labels[k], g);
          a0 = a1;
        });
      } else {
        const stacked = type === 'stacked';
        const all = stacked ? labels.map((_, i) => series.reduce((a, se) => a + (se.values[i] || 0), 0)) : series.flatMap((se) => se.values);
        let lo = spec.yMin != null ? spec.yMin : Math.min(0, ...all), hi = spec.yMax != null ? spec.yMax : Math.max(...all, 0);
        if (hi === lo) hi = lo + 1;
        const stepv = niceStep((hi - lo) / 4);
        if (spec.yMax == null) hi = Math.ceil(hi / stepv) * stepv;
        if (spec.yMin == null) lo = Math.floor(lo / stepv) * stepv;
        const tickW = Math.max(...[lo, hi].map((v) => fmt(v).length)) * 7 + 12;
        const L = tickW, R = W - 8, T = 18, B = H - 30;
        const y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
        for (let v = lo; v <= hi + 1e-9; v += stepv) {
          U.el(s, 'line', { x1: L, x2: R, y1: y(v), y2: y(v), class: 'u-axis', 'stroke-dasharray': v === 0 ? null : '2 4' });
          U.text(s, L - 8, y(v), fmt(Math.round(v * 1e6) / 1e6), { anchor: 'end', class: 'u-tick' });
        }
        const bw = (R - L) / Math.max(1, labels.length);
        const cxAt = (i) => L + bw * (i + 0.5);
        labels.forEach((lab, i) => { const t = U.text(s, cxAt(i), B + 16, lab, { anchor: 'middle', class: 'u-lab' }); put(reg, lab, t); t.dataset.dim = 'no'; });
        const anchors = {};
        if (type === 'line') {
          series.forEach((se, k) => {
            const g = U.el(s, 'g', {});
            const pts = se.values.map((v, i) => [cxAt(i), y(v)]);
            U.el(g, 'path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(''), fill: 'none', stroke: palette(k), 'stroke-width': k === 0 ? 2.5 : 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
            pts.forEach((p, i) => {
              const d = U.el(s, 'g', {});
              U.el(d, 'circle', { cx: p[0], cy: p[1], r: 4.5, fill: 'var(--bg)', stroke: palette(k), 'stroke-width': 2 });
              if (series.length === 1) U.text(d, p[0], p[1] - 14, fmt(se.values[i]), { anchor: 'middle', class: 'u-val' });
              put(reg, labels[i], d);
              (anchors[labels[i]] = anchors[labels[i]] || {})[se.id] = p;
            });
            put(reg, se.id, g);
          });
        } else {
          const n = stacked ? 1 : series.length, gw = Math.min(bw * 0.7, 46 * n), w = gw / n;
          const base = labels.map(() => 0);
          series.forEach((se, k) => {
            se.values.forEach((v, i) => {
              const x = stacked ? cxAt(i) - gw / 2 : cxAt(i) - gw / 2 + w * k;
              const v0 = stacked ? base[i] : 0, v1 = v0 + v;
              const top = Math.min(y(v0), y(v1)), ht = Math.abs(y(v1) - y(v0));
              const g = U.el(s, 'g', { class: 'u-bar' });
              U.el(g, 'rect', { x: x + 1, y: top, width: Math.max(1, w - 2), height: Math.max(0.5, ht), rx: Math.min(4, w / 4), fill: palette(k) });
              if (!stacked && n === 1) U.text(g, x + w / 2, top - 10, fmt(v), { anchor: 'middle', class: 'u-val' });
              if (stacked) base[i] = v1;
              put(reg, labels[i], g); put(reg, se.id, g);
              (anchors[labels[i]] = anchors[labels[i]] || {})[se.id] = [x + w / 2, top];
            });
          });
        }
        (spec.marks || []).forEach((m) => {
          const at = anchors[m.label] || {};
          const p = (m.series && at[m.series]) || Object.values(at).sort((a, b) => a[1] - b[1])[0];
          if (!p) { report(`mark "${m.id}" points at a label that is not in the chart: ${m.label}`); return; }
          const tip = h('div', 'u-mark', md(m.text));
          tip.style.left = `${Math.max(90, Math.min(W - 90, p[0]))}px`;
          tip.style.top = `${p[1]}px`;
          tip.dataset.dim = 'no';
          box.appendChild(tip);
          put(reg, m.id, tip);
        });
      }
      missing(reg, steps);
      apply = stepper(reg, steps);
      apply(Math.max(0, U.step));
    });
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
    sized(box, (W, H) => {
      box.innerHTML = '';
      const reg = {};
      const svg = U.svg(W, H, box);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const { pos, maxW } = place(nodes, edges, layout, W, H);
      const els = {};
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
      // keep cards inside the frame
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
      const pairs = {};
      edges.forEach((e) => {
        if (!els[e.from] || !els[e.to]) return;
        const a = rect(e.from), b = rect(e.to);
        const back = edges.some((o) => o.from === e.to && o.to === e.from);
        const bend = e.bend != null ? e.bend : layout === 'cycle' ? 0.18 : back ? 0.14 : 0;
        const [x1, y1] = clip(a, b.x, b.y), [x2, y2] = clip(b, a.x, a.y);
        const key = [e.from, e.to].sort().join('|');
        pairs[key] = (pairs[key] || 0) + 1;
        const g = U.arrow(svg, x1, y1, x2, y2, { bend, dashed: e.dashed, both: e.both, class: 'u-edge' });
        if (e.label) {
          const t = U.text(g, g.mid.x, g.mid.y, e.label, { anchor: 'middle', class: 'u-elabel' });
          const bb = t.getBBox();
          const bg = U.el(g, 'rect', { x: bb.x - 5, y: bb.y - 2, width: bb.width + 10, height: bb.height + 4, rx: 5, fill: 'var(--bg)' });
          g.insertBefore(bg, t);
        }
        put(reg, e.id, g);
      });
      missing(reg, steps);
      apply = stepper(reg, steps);
      apply(Math.max(0, U.step));
    });
    return (i) => apply(i);
  }
  /** Pixel centres for each node, and how wide a card may be so that neighbours do not touch. */
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
    // layered: rank = longest path from a source, ignoring edges that close a cycle
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
      // left to right; a plain chain too long for one row wraps onto the next, read like text
      // (a graph with branches stays on one row, its cards narrower, so its layers stay apart)
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
    // top to bottom, tidy-tree style: the bottom layer is spread evenly, each parent sits over the
    // middle of its children, and a layer that comes out crowded is pushed apart
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
      // childless nodes take the slots after the last placed one
      let edge = Math.max(...fixed.map((id) => xs[id]));
      ids.filter((id) => !kids(id).length).forEach((id) => (xs[id] = edge += gap));
      const sorted = [...ids].sort((a, b) => xs[a] - xs[b]);
      for (let k = 1; k < sorted.length; k++) xs[sorted[k]] = Math.max(xs[sorted[k]], xs[sorted[k - 1]] + gap);
    }
    // centre the drawing and shrink it if it came out wider than the frame
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
      box.innerHTML = '<div class="axis"></div>';
      const reg = {};
      const n = evs.length, pad = Math.min(90, W / (n * 2));
      const nums = evs.map((e) => (typeof e.at === 'number' ? e.at : null));
      const even = (k) => (n === 1 ? 0.5 : k / (n - 1));
      const cardW = Math.min(176, Math.max(96, ((W - 2 * pad) / Math.max(1, n - 1)) * 2 - 16));
      let scaled = nums.every((v) => v != null) && n > 1 && nums[n - 1] > nums[0];
      // cards alternate above and below, so two apart on the same side must not overlap
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
        const d = h('div', 'u-ev');
        d.style.left = `${xOf(k)}px`;
        d.innerHTML = `<div class="stem" style="${up ? `bottom:0;height:${gap}px` : `top:0;height:${gap}px`}"></div><div class="dot"></div>`;
        const c = h('div', 'u-card', `<div class="when">${e.icon ? U.iconHTML(e.icon, 15) : ''}${esc(e.when)}</div><b>${md(e.title)}</b>${e.text ? `<small>${md(e.text)}</small>` : ''}`);
        c.style.width = `${cardW}px`;
        c.style[up ? 'bottom' : 'top'] = `${gap}px`;
        d.appendChild(c);
        box.appendChild(d);
        // keep the card inside the frame
        const left = xOf(k) - cardW / 2;
        if (left < 0) c.style.transform = `translateX(calc(-50% + ${-left}px))`;
        if (left + cardW > W) c.style.transform = `translateX(calc(-50% - ${left + cardW - W}px))`;
        put(reg, e.id, d);
      });
      missing(reg, steps);
      apply = stepper(reg, steps);
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
    // one card per column, spanning every row
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
    rows.forEach((r, i) => {
      const rl = h('div', 'rl', md(r.label));
      rl.style.gridRow = `${i + 2}`; rl.style.gridColumn = '1';
      g.appendChild(rl);
      put(reg, r.id, rl);
      cols.forEach((c, k) => {
        const cell = h('div', 'c', md((r.cells || [])[k] || ''));
        cell.style.gridRow = `${i + 2}`; cell.style.gridColumn = `${k + 2}`;
        g.appendChild(cell);
        put(reg, r.id, cell); put(reg, c.id, cell);
        put(reg, `${r.id}.${c.id}`, cell);
      });
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
    items.forEach((it) => {
      const c = h('div', 'u-pt u-card', `${it.icon ? `<span class="ib">${U.iconHTML(it.icon, 20)}</span>` : ''}<span><b>${md(it.title)}</b>${it.text ? `<small>${md(it.text)}</small>` : ''}</span>`);
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
    // a span stays underlined once its step has passed; its note shows while it is in focus
    const firstAt = {};
    (steps || []).forEach((s, i) => [...(s.reveal || []), ...(s.focus || [])].forEach((id) => { if (!(id in firstAt)) firstAt[id] = i; }));
    const apply = (i) => {
      const focus = (steps && steps[i] && steps[i].focus) || [];
      for (const id in spans) {
        spans[id].classList.toggle('on', id in firstAt && i >= firstAt[id]);
        spans[id].classList.toggle('u-focus', focus.includes(id));
      }
      nb.innerHTML = '';
      focus.filter((id) => notes[id]).forEach((id) => {
        nb.appendChild(h('div', 'u-note u-card', `<q>${spans[id] ? spans[id].textContent : ''}</q><span>${md(notes[id])}</span>`));
      });
    };
    const bad = new Set();
    (steps || []).forEach((s) => [...(s.reveal || []), ...(s.focus || [])].forEach((id) => { if (!spans[id]) bad.add(id); }));
    if (bad.size) report(`steps name spans that are not in the text: ${[...bad].join(', ')}`);
    return apply;
  }

  const KINDS = { chart, diagram, timeline, compare, points, passage };
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
