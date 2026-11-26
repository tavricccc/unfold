// Checks a written visual before the learner sees it. Every problem is described in words Claude
// can act on, so a failed check can be sent back for one repair.
import { compile } from '../src/widgets/expr.ts';
import { ICONS } from '../src/kit/icons.ts';
import type { Step, Widget } from '../src/lesson.ts';

/** The ids a kit visual defines, or undefined when the widget is not a kit visual. */
function kitIds(w: Widget): Set<string> | undefined {
  const ids = new Set<string>();
  const add = (...v: (string | undefined)[]) => v.forEach((x) => x != null && ids.add(x));
  switch (w.kind) {
    case 'chart': {
      const c = w.chart!;
      add(...c.labels); c.series.forEach((s) => add(s.id)); c.marks?.forEach((m) => add(m.id));
      return ids;
    }
    case 'diagram': {
      const d = w.diagram!;
      d.nodes.forEach((n) => add(n.id)); d.edges.forEach((e) => add(e.id ?? `${e.from}>${e.to}`));
      return ids;
    }
    case 'timeline': {
      const t = w.timeline!;
      t.events.forEach((e) => add(e.id)); t.spans?.forEach((s) => add(s.id));
      return ids;
    }
    case 'compare': {
      const c = w.compare!;
      c.columns.forEach((col) => add(col.id));
      c.rows.forEach((r) => { add(r.id); c.columns.forEach((col) => add(`${r.id}.${col.id}`)); });
      return ids;
    }
    case 'points': w.points!.items.forEach((it) => add(it.id)); return ids;
    case 'passage': for (const m of w.passage!.text.matchAll(/\[\[([^|\]]+)\|[^\]]+\]\]/g)) add(m[1].trim()); return ids;
    default: return undefined;
  }
}

/** Problems with a visual and the steps that drive it; empty when it is fine. */
export function problems(w: Widget, steps: Step[]): string[] {
  const out: string[] = [];
  const spec = (w as unknown as Record<string, unknown>)[w.kind];
  if (w.kind === 'bubble-sort') { if (!w.values?.length) out.push('bubble-sort has no values'); return out; }
  if (w.kind === 'html') {
    if (!w.html?.trim()) return ['html widget is empty'];
    for (const m of w.html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { new Function(m[1]); } catch (e) { out.push(`a <script> in the html does not parse: ${(e as Error).message}`); }
    }
    for (const m of w.html.matchAll(/U\.icon(?:HTML)?\(\s*(?:[^,()]+,\s*)?['"]([\w-]+)['"]/g)) if (!ICONS[m[1]]) out.push(`unknown icon "${m[1]}"`);
    if (/\b(?:src|href)\s*=\s*["']https?:/i.test(w.html)) out.push('the html loads an external URL; it must be self-contained');
    return out;
  }
  if (w.kind === 'plot') {
    const p = w.plot;
    if (!p) return ['plot widget has no plot'];
    const params = new Set((p.params ?? []).map((q) => q.name));
    const tryExpr = (e: unknown, where: string) => {
      if (e == null || typeof e === 'number') return;
      try { compile(e as string); } catch (err) { out.push(`${where}: expression "${e}" does not parse (${(err as Error).message})`); }
    };
    p.items.forEach((it, k) => {
      for (const key of ['expr', 'x', 'y', 'a', 'b', 'n', 'at'] as const) tryExpr(it[key], `item ${k} ${key}`);
      it.from?.forEach((e) => tryExpr(e, `item ${k} from`)); it.to?.forEach((e) => tryExpr(e, `item ${k} to`));
      it.points?.forEach((pt) => pt.forEach((e) => tryExpr(e, `item ${k} points`)));
    });
    p.readouts?.forEach((r) => tryExpr(r.expr, `readout "${r.label}"`));
    steps.forEach((s, i) => s.set?.forEach((v) => { if (!params.has(v.name)) out.push(`step ${i} sets "${v.name}", which is not a param`); }));
    return out;
  }
  if (!spec) return [`a ${w.kind} widget needs its "${w.kind}" object`];
  const ids = kitIds(w)!;
  steps.forEach((s, i) => [...(s.reveal ?? []), ...(s.focus ?? [])].forEach((id) => {
    if (!ids.has(id)) out.push(`step ${i} names "${id}", which is not an id in the ${w.kind}`);
  }));
  if (w.kind === 'chart') {
    const c = w.chart!;
    c.series.forEach((s) => { if (c.type !== 'pie' && s.values.length !== c.labels.length) out.push(`series "${s.id}" has ${s.values.length} values for ${c.labels.length} labels`); });
    c.marks?.forEach((m) => { if (!c.labels.includes(m.label)) out.push(`mark "${m.id}" points at "${m.label}", which is not a label`); });
  }
  if (w.kind === 'diagram') {
    const nodes = new Set(w.diagram!.nodes.map((n) => n.id));
    w.diagram!.edges.forEach((e) => { if (!nodes.has(e.from) || !nodes.has(e.to)) out.push(`edge ${e.from}>${e.to} joins a node that does not exist`); });
  }
  if (w.kind === 'timeline') {
    const ev = new Set(w.timeline!.events.map((e) => e.id));
    w.timeline!.spans?.forEach((s) => { if (!ev.has(s.from) || !ev.has(s.to)) out.push(`span "${s.id}" names an event that does not exist`); });
  }
  if (w.kind === 'compare') {
    const n = w.compare!.columns.length;
    w.compare!.rows.forEach((r) => { if (r.cells.length !== n) out.push(`row "${r.id}" has ${r.cells.length} cells for ${n} columns`); });
  }
  if (w.kind === 'passage') {
    const spans = ids;
    w.passage!.notes?.forEach((n) => { if (!spans.has(n.id)) out.push(`note "${n.id}" has no [[${n.id}|...]] in the text`); });
  }
  return out;
}
