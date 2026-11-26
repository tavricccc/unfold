import type { KitKind, Step, Widget } from '../lesson';
import { ICONS } from './icons';
import runtime from './runtime.js?raw';

/** JSON that is safe inside a <script> element. */
const js = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** The kit, loaded ahead of every visual: its icons and the `U` runtime. */
export const KIT_HEAD = `<script>window.__UNFOLD_ICONS=${js(ICONS)}</script><script>${runtime}</script>`;

/** The markup of a declarative kit visual, driven by the chapter's steps. */
export function kitBody(w: Widget, steps: Step[]): string {
  const kind = w.kind as KitKind;
  const lean = steps.map((s) => ({ reveal: s.reveal, focus: s.focus }));
  return `<script>U.mount(${js(kind)}, ${js(w[kind])}, ${js(lean)})</script>`;
}
