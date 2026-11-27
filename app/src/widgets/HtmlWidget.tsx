import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { isolate, KIT_HEAD } from '../kit/doc';
import type { WidgetHandle, WidgetProps } from './types';

const VARS = ['--fg', '--fg-2', '--fg-3', '--fg-4', '--line', '--line-2', '--sub', '--bg', '--raise', '--hover', '--acc', '--acc-soft', '--acc-ink', '--acc-fg', '--done', '--sans', '--mono'];
/** How long after a step change an html widget counts as still animating. */
const ANIM_MS = 1600;

function themeVars() {
  const cs = getComputedStyle(document.documentElement);
  return VARS.map((v) => `${v}:${cs.getPropertyValue(v).trim()};`).join('');
}

/**
 * Runs a Claude-written widget (or declarative kit visual) in a sandboxed iframe: scripts allowed,
 * no same-origin access, no network (CSP), driven by postMessage({ type: 'step', index, animate }).
 * Theme & accent changes are pushed live over postMessage so the iframe never reloads or loses state.
 */
export const HtmlWidget = forwardRef<WidgetHandle, WidgetProps & { html: string; kit?: boolean; onError?: (message: string) => void }>(
  function HtmlWidget({ html, kit, step, animate, onError }, ref) {
    const frame = useRef<HTMLIFrameElement>(null);
    const [loaded, setLoaded] = useState(false);
    const changedAt = useRef(0);
    const replayTimer = useRef<number | undefined>(undefined);
    const stepRef = useRef(step);
    stepRef.current = step;

    // Only capture initial vars when `html` changes; live theme updates flow via postMessage.
    const doc = useMemo(() => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:">
<style>:root{${themeVars()}} html,body{margin:0;height:100%;overflow:hidden;background:transparent;color:var(--fg);font-family:var(--sans);font-size:14px} body>*:not(script):not(style){max-width:100%}</style>
${KIT_HEAD}</head><body>${isolate(html)}</body></html>`, [html]);

    useEffect(() => {
      setLoaded(false);
    }, [doc]);

    // Push theme/accent changes live without reloading the iframe.
    useEffect(() => {
      const pushTheme = () => {
        frame.current?.contentWindow?.postMessage({ type: 'theme', vars: themeVars() }, '*');
      };
      const mo = new MutationObserver(pushTheme);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
      return () => mo.disconnect();
    }, []);

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

    const post = (msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(msg, '*');

    useEffect(() => {
      window.clearTimeout(replayTimer.current);
      changedAt.current = animate ? Date.now() : 0;
      post({ type: 'step', index: step, animate });
    }, [step, animate]);

    useEffect(() => () => window.clearTimeout(replayTimer.current), []);

    useImperativeHandle(ref, () => ({
      busy: () => Date.now() - changedAt.current < ANIM_MS,
      finish: () => {
        window.clearTimeout(replayTimer.current);
        changedAt.current = 0;
        post({ type: 'step', index: stepRef.current, animate: false });
      },
      replay: () => {
        window.clearTimeout(replayTimer.current);
        changedAt.current = Date.now();
        if (kit) {
          post({ type: 'replay', index: stepRef.current });
        } else if (stepRef.current > 0) {
          post({ type: 'step', index: stepRef.current - 1, animate: false });
          replayTimer.current = window.setTimeout(() => post({ type: 'step', index: stepRef.current, animate: true }), 36);
        } else {
          post({ type: 'replay', index: 0 });
        }
      },
    }), [kit]);

    return (
      <iframe
        ref={frame} className={`hw${loaded ? ' ready' : ''}`} title="互動元件" sandbox="allow-scripts" srcDoc={doc}
        onLoad={() => {
          post({ type: 'theme', vars: themeVars() });
          post({ type: 'step', index: stepRef.current, animate: false });
          setLoaded(true);
        }}
      />
    );
  },
);
