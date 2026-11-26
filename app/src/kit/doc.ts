import type { KitKind, Step, Widget } from '../lesson';
import { ICONS } from './icons';
import runtime from './runtime.js?raw';

/** JSON that is safe inside a <script> element. */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** The kit, loaded ahead of every visual: its icons and the `U` runtime. */
export const KIT_HEAD = `<script>window.__UNFOLD_ICONS=${js(ICONS)}</script><script>${runtime}</script>`;

/**
 * Runs each inline script of a written visual inside a block, so its top-level const and let
 * cannot collide with the window's own names (a `const top` or `const name` would otherwise stop
 * the whole script). Function declarations still reach the global scope, for inline handlers.
 */
export function isolate(html: string): string {
  return html.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (all, attrs = '', code: string) =>
    /\bsrc\s*=|type\s*=\s*["']?module/i.test(attrs) ? all : `<script${attrs}>{\n${code}\n}</script>`);
}

/** The markup of a declarative kit visual, driven by the chapter's steps. */
export function kitBody(w: Widget, steps: Step[]): string {
  const kind = w.kind as KitKind;
  const lean = steps.map((s) => ({ reveal: s.reveal, focus: s.focus }));
  return `<script>U.mount(${js(kind)}, ${js(w[kind])}, ${js(lean)})</script>`;
}
