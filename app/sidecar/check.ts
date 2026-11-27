// Checks a written visual before the learner sees it. Every problem is described in words Claude
// can act on, so a failed check can be sent back for one repair.
import { compile } from '../src/widgets/expr.ts';
import { ICONS } from '../src/kit/icons.ts';
import { KIT_KINDS, type Lesson, type Step, type Widget } from '../src/lesson.ts';

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
    case 'architecture': {
      const a = w.architecture!;
      a.groups?.forEach((g) => add(g.id)); a.nodes.forEach((n) => add(n.id)); a.edges.forEach((e) => add(e.id ?? `${e.from}>${e.to}`));
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
    case 'code': w.code!.states.forEach((st) => add(st.id)); return ids;
    case 'quiz': w.quiz!.questions.forEach((q) => add(q.id)); return ids;
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
  if (w.kind === 'architecture') {
    const a = w.architecture!;
    const groups = new Set((a.groups ?? []).map((g) => g.id));
    const nodes = new Set(a.nodes.map((n) => n.id));
    a.nodes.forEach((n) => { if (n.group && !groups.has(n.group)) out.push(`node "${n.id}" sits in group "${n.group}", which does not exist`); });
    a.edges.forEach((e) => { if (!nodes.has(e.from) || !nodes.has(e.to)) out.push(`edge ${e.from}>${e.to} joins a node that does not exist`); });
    const seen = new Set<string>();
    for (const id of [...groups, ...a.nodes.map((n) => n.id)]) { if (seen.has(id)) out.push(`id "${id}" is used twice`); seen.add(id); }
  }
  if (w.kind === 'diagram' || w.kind === 'architecture') {
    const icons = (w.kind === 'diagram' ? w.diagram!.nodes : [...w.architecture!.nodes, ...(w.architecture!.groups ?? [])]).map((n) => n.icon);
    icons.forEach((ic) => { if (ic && !ICONS[ic]) out.push(`unknown icon "${ic}"`); });
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
  if (w.kind === 'code') {
    const c = w.code!;
    if (!c.lines?.length) out.push('code widget has no lines');
    if (!c.states?.length) out.push('code widget has no states');
    const maxLine = c.lines?.length ?? 0;
    c.states?.forEach((st) => {
      st.lines.forEach((ln) => { if (ln < 1 || ln > maxLine) out.push(`code state "${st.id}" highlights line ${ln}, outside 1..${maxLine}`); });
    });
  }
  if (w.kind === 'quiz') {
    const qz = w.quiz!;
    if (!qz.questions?.length) out.push('quiz widget has no questions');
    qz.questions?.forEach((q) => {
      if ((q.options?.length ?? 0) < 2) out.push(`quiz question "${q.id}" needs at least 2 options`);
      if (!q.answer?.length) out.push(`quiz question "${q.id}" has no answer indices`);
      q.answer?.forEach((idx) => { if (idx < 0 || idx >= (q.options?.length ?? 0)) out.push(`quiz question "${q.id}" answer index ${idx} is out of range`); });
    });
  }
  return out;
}

/**
 * How many of a streamed chapter's first steps can be played: whole steps (one is whole once the
 * next has begun, or the steps are done), on scenes that pass the checks. A kit scene waits for all
 * of its steps, because what they reveal is shown from the start until a step says otherwise.
 */
export function playableSteps(steps: Step[], closed: boolean): number {
  const done = closed ? steps.length : Math.max(0, steps.length - 1);
  if (!steps[0]?.scene || done === 0) return 0;
  const starts = steps.flatMap((st, k) => (st.scene && k < done ? [k] : []));
  let ready = 0;
  for (let n = 0; n < starts.length; n++) {
    const s = starts[n];
    const next = steps.findIndex((st, k) => k > s && !!st.scene);
    const shut = closed || next >= 0;
    const end = Math.min(next >= 0 ? next : steps.length, done);
    const w = steps[s].scene!;
    if (problems(w, steps.slice(s, end)).length) break;
    if (!shut && (KIT_KINDS as readonly string[]).includes(w.kind)) break;
    ready = end;
  }
  return ready;
}

/**
 * Problems with the scenes a run of steps opens; `base` is the scene the steps before the first one
 * continue (a follow-up's steps on the chapter's last scene). Without it the first step must open one.
 */
export function sceneProblems(steps: Step[], base?: { widget: Widget; steps: Step[] }): string[] {
  const bad: string[] = [];
  const starts = steps.flatMap((st, k) => (st.scene ? [k] : []));
  if (base) {
    const cont = steps.slice(0, starts[0] ?? steps.length);
    if (cont.length) bad.push(...problems(base.widget, [...base.steps, ...cont]));
  } else if (!steps[0]?.scene) bad.push('the first step must open a scene ("scene")');
  starts.forEach((s, n) => {
    const own = steps.slice(s, starts[n + 1] ?? steps.length);
    const where = starts.length > 1 || base ? `the scene opened at step ${s}: ` : '';
    bad.push(...problems(steps[s].scene!, own).map((p) => where + p));
  });
  return bad;
}

/** Problems with a whole chapter, saved before scenes existed (one widget) or after. */
export const lessonProblems = (L: Lesson): string[] =>
  L.widget && !L.steps[0]?.scene ? problems(L.widget, L.steps) : sceneProblems(L.steps);
