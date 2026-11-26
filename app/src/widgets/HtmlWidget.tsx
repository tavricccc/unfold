import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { KIT_HEAD } from '../kit/doc';
import type { WidgetHandle, WidgetProps } from './types';

const VARS = ['--fg', '--fg-2', '--fg-3', '--fg-4', '--line', '--line-2', '--sub', '--bg', '--raise', '--hover', '--acc', '--acc-soft', '--acc-ink', '--acc-fg', '--done', '--sans', '--mono'];
/** How long after a step change an html widget counts as still animating. */
const ANIM_MS = 1600;

function themeVars() {
  const cs = getComputedStyle(document.documentElement);
  return VARS.map((v) => `${v}:${cs.getPropertyValue(v).trim()};`).join('');
}

/** Re-reads the theme variables whenever <html> switches theme or accent. */
function useThemeVars() {
  const [vars, setVars] = useState(themeVars);
  useEffect(() => {
    const mo = new MutationObserver(() => setVars(themeVars()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
    return () => mo.disconnect();
  }, []);
  return vars;
}

/**
 * Runs a Claude-written widget in a sandboxed iframe: scripts allowed, no same-origin access,
 * no network (CSP), driven by postMessage({ type: 'step', index, animate }). The kit (src/kit) is
 * loaded first; errors it catches come back through onError.
 */
export const HtmlWidget = forwardRef<WidgetHandle, WidgetProps & { html: string; onError?: (message: string) => void }>(function HtmlWidget({ html, step, animate, onError }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const vars = useThemeVars();
  const changedAt = useRef(0);
  const stepRef = useRef(step);
  stepRef.current = step;

  const doc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:">
<style>:root{${vars}} html,body{margin:0;height:100%;overflow:hidden;background:transparent;color:var(--fg);font-family:var(--sans);font-size:14px} body>*:not(script):not(style){max-width:100%}</style>
${KIT_HEAD}</head><body>${html}</body></html>`, [html, vars]);

  const errRef = useRef(onError);
  errRef.current = onError;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.type !== 'widget-error') return;
      console.error('widget error:', e.data.message);
      errRef.current?.(String(e.data.message));
    };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, []);

  const post = (index: number, anim: boolean) =>
    frame.current?.contentWindow?.postMessage({ type: 'step', index, animate: anim }, '*');

  useEffect(() => {
    changedAt.current = animate ? Date.now() : 0;
    post(step, animate);
  }, [step, animate]);

  useImperativeHandle(ref, () => ({
    busy: () => Date.now() - changedAt.current < ANIM_MS,
    finish: () => { changedAt.current = 0; post(stepRef.current, false); },
  }));

  return (
    <iframe
      ref={frame} className="hw" title="互動元件" sandbox="allow-scripts" srcDoc={doc}
      onLoad={() => post(stepRef.current, false)}
    />
  );
});
