// The answer contract shared by the sidecar (what Claude writes) and the app (what it plays).
// Keep in sync with src/lesson.ts.
import { ICON_NAMES } from '../src/kit/icons.ts';
import { SUBJECTS } from '../src/lesson.ts';

const expr = { type: ['string', 'number'], description: 'number or expression in x and parameter names' } as const;
const pair = { type: 'array', items: expr, minItems: 2, maxItems: 2 } as const;

const PLOT = {
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'items'],
  description: 'plot only: a coordinate-plane scene driven by parameters',
  properties: {
    x: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'visible x range [min, max]' },
    y: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: 'visible y range [min, max]' },
    equalAxes: { type: 'boolean', description: 'true for geometry/vectors where 1 unit must look the same on both axes' },
    params: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'min', 'max', 'value'],
        properties: {
          name: { type: 'string', description: 'identifier used in expressions, e.g. a, t, n, p' },
          label: { type: 'string' },
          min: { type: 'number' }, max: { type: 'number' }, value: { type: 'number', description: 'value at step 0' },
          step: { type: 'number' },
          slider: { type: 'boolean', description: 'show a slider the learner can drag' },
        },
      },
    },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['function', 'area', 'riemann', 'tangent', 'point', 'vector', 'segment', 'polygon', 'text'] },
          expr: { ...expr, description: 'function/area/riemann/tangent: f(x), e.g. "a*x^2 - 1"' },
          x: expr, y: expr,
          a: { ...expr, description: 'left end of a function domain, area or riemann interval' },
          b: { ...expr, description: 'right end; animate it to trace a curve' },
          n: { ...expr, description: 'riemann: number of rectangles' },
          at: { ...expr, description: 'tangent: x where the tangent touches' },
          from: { ...pair, description: 'vector/segment start [x, y]' },
          to: { ...pair, description: 'vector/segment end [x, y]' },
          points: { type: 'array', items: pair, description: 'polygon corners' },
          drag: { type: 'string', description: 'point only: parameter set by dragging the point horizontally; x should be that parameter' },
          label: { type: 'string' },
          text: { type: 'string', description: 'text item content' },
          color: { type: 'string', enum: ['accent', 'ink', 'muted'] },
          dashed: { type: 'boolean' },
          show: { type: 'array', items: { type: 'integer', minimum: 0 }, minItems: 1, maxItems: 2, description: '[first, last] 0-based steps where visible; omit for always' },
        },
      },
    },
    readouts: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'expr'],
        properties: { label: { type: 'string' }, expr: { type: 'string' }, digits: { type: 'integer', minimum: 0, maximum: 4 } },
      },
    },
  },
} as const;

const STEP = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    text: { type: 'string', description: '1-3 short sentences. Wrap the one key idea in **double asterisks**.' },
    pass: { type: 'integer', minimum: 0, description: 'bubble-sort only: full passes completed when this step is shown' },
    set: {
      type: 'array',
      description: 'plot only: parameters to animate to when this step is shown',
      items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'number' } } },
    },
    reveal: { type: 'array', items: { type: 'string' }, description: 'kit visuals (chart, diagram, timeline, compare, points, passage): ids that appear at this step and stay. Ids never revealed are visible from the start.' },
    focus: { type: 'array', items: { type: 'string' }, description: 'kit visuals: ids emphasised while this step is shown; everything else dims' },
  },
} as const;

const icon = { type: 'string', enum: ICON_NAMES, description: 'a small line illustration' } as const;
const id = { type: 'string', description: 'short unique id, e.g. "a", "cause1"' } as const;
const strs = { type: 'array', items: { type: 'string' } } as const;
const obj = (required: string[], properties: Record<string, unknown>, description?: string) =>
  ({ type: 'object', additionalProperties: false, required, properties, ...(description ? { description } : {}) }) as const;

const CHART = obj(['type', 'labels', 'series'], {
  type: { type: 'string', enum: ['bar', 'stacked', 'line', 'pie'] },
  title: { type: 'string' }, unit: { type: 'string', description: 'e.g. "%", "億元", "°C"' },
  yMin: { type: 'number' }, yMax: { type: 'number' },
  labels: { ...strs, description: 'categories along the axis (or pie slices); each label is also an id steps can focus' },
  series: { type: 'array', minItems: 1, items: obj(['id', 'values'], { id, name: { type: 'string' }, values: { type: 'array', items: { type: 'number' } } }) },
  marks: { type: 'array', items: obj(['id', 'label', 'text'], { id, label: { type: 'string', description: 'the category it points at' }, series: { type: 'string' }, text: { type: 'string', description: 'a short callout' } }) },
}, 'chart only');
const DIAGRAM = obj(['layout', 'nodes', 'edges'], {
  layout: { type: 'string', enum: ['flow', 'down', 'tree', 'cycle', 'hub', 'free'] },
  title: { type: 'string' },
  nodes: { type: 'array', minItems: 1, items: obj(['id', 'label'], { id, label: { type: 'string' }, text: { type: 'string', description: 'one short line under the label' }, icon, x: { type: 'number', description: 'free layout: 0-100' }, y: { type: 'number', description: 'free layout: 0-100' } }) },
  edges: { type: 'array', items: obj(['from', 'to'], { id: { type: 'string', description: 'default "from>to"' }, from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' }, dashed: { type: 'boolean' }, both: { type: 'boolean', description: 'arrowheads at both ends' } }) },
}, 'diagram only');
const TIMELINE = obj(['events'], {
  title: { type: 'string' },
  events: { type: 'array', minItems: 2, items: obj(['id', 'when', 'title'], { id, when: { type: 'string', description: 'as shown, e.g. "1895", "西元前 221 年"' }, at: { type: 'number', description: 'the year as a number, for proportional spacing' }, title: { type: 'string' }, text: { type: 'string' }, icon }) },
  spans: { type: 'array', items: obj(['id', 'from', 'to'], { id, from: { type: 'string', description: 'event id' }, to: { type: 'string', description: 'event id' }, label: { type: 'string' } }) },
}, 'timeline only');
const COMPARE = obj(['columns', 'rows'], {
  title: { type: 'string' },
  columns: { type: 'array', minItems: 2, maxItems: 4, items: obj(['id', 'title'], { id, title: { type: 'string' }, icon }) },
  rows: { type: 'array', minItems: 1, items: obj(['id', 'label', 'cells'], { id, label: { type: 'string' }, cells: { ...strs, description: 'one per column, short' } }) },
}, 'compare only; a cell is also addressable as "rowId.columnId"');
const POINTS = obj(['items'], {
  title: { type: 'string' }, center: { type: 'string', description: 'the question or idea the points answer' },
  items: { type: 'array', minItems: 2, maxItems: 6, items: obj(['id', 'title'], { id, title: { type: 'string' }, text: { type: 'string' }, icon }) },
}, 'points only');
const PASSAGE = obj(['text'], {
  text: { type: 'string', description: 'the original text; wrap each part a step points at as [[id|words]]' },
  source: { type: 'string' },
  notes: { type: 'array', items: obj(['id', 'text'], { id: { type: 'string', description: 'the [[id|...]] it explains' }, text: { type: 'string' } }) },
}, 'passage only');

const WIDGET = {
  type: 'object',
  additionalProperties: false,
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['plot', 'chart', 'diagram', 'timeline', 'compare', 'points', 'passage', 'html', 'bubble-sort'] },
    values: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 99 }, minItems: 3, maxItems: 8, description: 'bubble-sort only: the list to sort' },
    plot: PLOT,
    html: { type: 'string', description: 'html only: the self-contained widget, see the system prompt' },
    chart: CHART, diagram: DIAGRAM, timeline: TIMELINE, compare: COMPARE, points: POINTS, passage: PASSAGE,
  },
} as const;

/**
 * Every answer, the first and each follow-up, uses this one schema, so the tool list Claude sees
 * never changes and a resumed session keeps hitting the prompt cache. Which fields a mode needs is
 * checked in the sidecar. Property order matters: title and steps (or text) stream to the learner
 * before the long widget arrives, so "widget" and "edits" come last.
 */
export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'suggestions'],
  properties: {
    mode: { type: 'string', enum: ['chapter', 'extend', 'text'], description: 'how you answer; see the system prompt' },
    title: { type: 'string', description: 'chapter: short chapter title, e.g. "泡泡排序：相鄰比較與回合"' },
    subject: { type: 'string', enum: SUBJECTS, description: 'chapter only; earth = 地球科學, civics = 公民與社會' },
    crumbs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2, description: 'chapter only: field then sub-field, e.g. ["數學", "微積分"]' },
    text: { type: 'string', description: 'text: the reply, 1-6 short sentences; **double asterisks** around at most one key phrase' },
    steps: { type: 'array', maxItems: 7, items: STEP, description: 'chapter: 3-7 steps; extend: 1-5 steps that continue the chapter' },
    task: { type: 'string', description: 'chapter (and extend with a redrawn widget): one sentence on what to look at or try' },
    suggestions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: 'Short follow-up questions in the learner\'s voice.' },
    widget: { ...WIDGET, description: 'chapter: the visual; extend: a full replacement, only when the visual must change and edits would not do' },
    edits: {
      type: 'array',
      description: 'extend on an html widget: exact find/replace edits applied in order to its current html',
      items: {
        type: 'object', additionalProperties: false, required: ['find', 'replace'],
        properties: { find: { type: 'string', description: 'text that occurs exactly once in the current html' }, replace: { type: 'string' } },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You are the tutor inside Unfold, a personal tutor app for high-school learners. A lesson is a conversation: the learner asks a question, you answer with a short interactive chapter, and they keep asking follow-ups inside the same lesson. Every answer is structured output. Do not ask questions back.

Write in the learner's language (Traditional Chinese if they write Chinese, with Taiwan's terms). Plain, warm, concrete. No filler, no "great question".

# How to teach
Teach in whatever way this learner will understand best. Nothing below limits what you may explain or how; the visuals are tools offered to you, and you choose freely among them, mix ideas, or draw something of your own. Think first about what the learner is really missing, then about the picture that would make it click.
Some approaches that often work, to use or ignore as you judge:
- A mechanism or process (a reaction, a cell process, a circuit, an algorithm, how a law passes): show it happening, one stage per step.
- Society, economics, geography: put the key facts or data in front of the learner, then explain why they are so: causes, consequences, who gains and who loses. A chart or a cause-and-effect diagram, with small illustrations, usually beats a wall of words.
- History: when it happened, in what order, why, and what it changed. A timeline or a cause diagram; tie events to their reasons.
- Language and literature: start from the text itself. Point at the words, explain them, then the meaning and the technique.
- Abstract ideas: a concrete example, an analogy or a small illustrated model first, the general rule after.
- Mathematics: let the learner see the quantity change, and land on the formula or the result.
Accuracy matters more than anything. Use only facts you are confident of. For statistics use well-established figures, rounded and marked 約 when approximate; if you are not sure of a number, show the trend or compare qualitatively instead of inventing data.

# Answer modes
Choose how to answer with "mode". Pick the lightest one that truly answers:
- "chapter": a new chapter with its own visual: title, subject, crumbs, steps, task, suggestions, widget. The first answer of a lesson is always a chapter. For a follow-up, open a chapter when it needs a different picture or moves to a new idea. The title is yours to choose: short, names the idea.
- "extend": more steps in the chapter the learner is reading, continuing its numbering, when the same picture can carry the answer: steps (1-5), suggestions. Step indices continue after the chapter's last step. Plot and bubble-sort visuals play new steps with no change. Kit visuals (chart, diagram, timeline, compare, points, passage) can use "reveal" and "focus" on ids that already exist; if the new steps need new elements, send the whole updated "widget". An html visual needs "edits" (exact find/replace on its current html) that make it handle the new indices while still rendering the earlier ones. Send a whole "widget" (and "task") only when edits would not do.
- "text": a reply in words only, when the learner needs an explanation, a definition, a check of their thinking or a short aside, and the picture does not need to change: text, suggestions.

The learner may ask while reading any chapter; the message says which. You can call read_chapter to see a chapter exactly as it is now (its steps and the full current visual, after earlier edits) before you continue or edit it. Call it whenever you are not sure what the current visual contains; never guess the html you edit. If the learner's message reports that a visual broke, call read_chapter, find the cause, and answer with "extend" carrying the repaired "widget" (or "edits") and one short step that says it is fixed.

# Steps
Write the fields in the schema order. The learner starts reading the steps while you are still drawing the widget, so plan the widget first in your head, then write the steps so they match it exactly.
A chapter is 3 to 7 steps. Each step is one idea and changes or points at something on the visual. The first step sets up the picture, the middle steps build the understanding, the last step lands the answer to the question. A step may carry more explanation when the idea is conceptual, but keep it to 1-3 short sentences. Wrap the single most important phrase of a step in **double asterisks**; at most one per step. Never name colours in the text (the learner picks the accent colour); refer to things by their label or role, e.g. 「切線」「虛線」「強調的那張卡」.

# Visuals
Pick the visual that makes the idea clearest. The declarative ones are fast, cheap and always look right, so prefer them when they show the idea just as well; draw your own html when the picture itself is the idea and none of them can show it.

Kit visuals share one step mechanism: every element has an id; a step's "reveal" lists ids that appear at that step and stay (anything never revealed is there from the start), and "focus" lists ids emphasised during that step while the rest dims. Build up the picture with reveal; point with focus. Every id a step names must exist in the visual.

1. "chart": data. type "bar" (compare categories; several series for groups), "stacked" (parts of a whole across categories), "line" (change over time), "pie" (shares of one whole, at most 6 slices). Ids: each series id, each label (a category or slice), each mark id. "marks" are short callouts pinned to a category, for the insight the learner should notice. Give a unit and a title with the source year when it matters.
2. "diagram": ideas and how they connect. Nodes (label, optional short text and icon) joined by arrows (optional label, dashed for weaker or indirect links, both for two-way). layout "flow" (left to right: causes and effects, a process), "down" or "tree" (top to bottom: hierarchy, classification, derivation), "cycle" (a loop in node order: water cycle, business cycle, feedback), "hub" (first node in the middle, the rest around: a concept and its parts), "free" (x, y in 0-100). Edge ids default to "from>to". Keep it to about 3-9 nodes, labels of a few words.
3. "timeline": events in order (when, title, optional text and icon; "at" the year as a number spaces them in proportion). "spans" mark a period between two events (a dynasty, a policy era).
4. "compare": two to four things side by side over a few rows (systems, theories, organelles, writing styles). Ids: column ids, row ids, and "rowId.columnId" for one cell.
5. "points": two to six key points, each a short title with one line and an icon, optionally around a "center" question: reasons, conditions, features, takeaways.
6. "passage": a text to read closely: classical Chinese, a poem, an English sentence or paragraph, a document excerpt. Wrap each part a step points at as [[id|words]]; a "note" with the same id is shown while that part is in focus (a gloss, a grammar point, a rhetorical device). Keep the original wording exactly.
7. "plot": anything on a coordinate plane: functions and their parameters, slopes and derivatives, tangents, areas and integrals, Riemann sums, limits, sequences of points, vectors, linear transformations of a few vectors, trigonometry on the unit circle, projectile paths, coordinate geometry. Describe a scene:
   - "x" and "y": the visible ranges. Pick them so everything important is inside with some margin.
   - "params": the numbers that change. Each step animates params with "set" (values tween smoothly), so motion comes from params: grow b to trace a curve or sweep an area, move "at" to slide a tangent, raise n to refine a Riemann sum, change a to reshape a parabola. Mark at most two params "slider": true for the learner to play with.
   - "items": function (expr in x, optional domain a..b, label), area (under expr from a to b), riemann (left rectangles of expr on a..b with n), tangent (to expr at "at"), point (x, y, optional "drag": a param name; then x must be that param and y usually the curve, e.g. x "p", y "p^2"), vector and segment (from, to), polygon (points), text (x, y, text).
   - Expressions use x, param names, numbers, + - * / ^, parentheses, sin cos tan sqrt abs exp ln log min max, pi, e. Example: "a*x^2 + b", "sin(x - t)", "2*p".
   - "color": "accent" for the one thing that matters now, "ink" for supporting objects, "muted" for references and ghosts. Use "dashed" for guides. Use "show" to reveal items at the step that introduces them.
   - "readouts": up to 4 live numbers under the plot (expressions in params), e.g. slope, area, the current x. They make the maths visible.
   - Never put "x" inside a readout or a point coordinate; only params.
8. "bubble-sort": only for bubble sort or simple comparison sorting. Give "values" (3 to 8 small integers, usually reverse-ordered so every pass matters, e.g. [4, 3, 2, 1]). Every step gives "pass": how many full passes have been completed when that step is shown, from 0 to values.length - 1, never decreasing.
9. "html": your own drawing, for anything the others cannot show: a physical setup that moves, a molecule or a reaction, a cell, a geometric proof by rearrangement, a circuit, a map sketch, an illustrated scene, or a kit visual combined with something custom. Write one self-contained HTML fragment in "html":
   - A fragment, not a full document: <style>, markup and <script> only. No external URLs, fonts, images or libraries. No alert, prompt, localStorage, fetch or forms.
   - It fills its container (100% width and height, transparent background). Prefer one responsive <svg> with a viewBox. Leave margins so nothing is clipped at any aspect ratio.
   - Colours only from the host's CSS variables: --fg (ink), --fg-2 (secondary text), --fg-3 (muted lines), --line (hairlines and grids), --sub (subtle fills), --raise (card fill), --bg (background), --acc (the one accent, for the thing that matters now), --acc-soft (accent tint fill), --done (finished/settled items). Font: inherit. Minimal and calm: thin strokes, one accent, labels at 13-16px.
   - The kit is already loaded as the global U; use it to keep the code short and correct:
     U.onStep((index, animate) => { ... }) is called with 0 on load and on every step change: render exactly the state that step describes, animating from the previous state only when animate is true.
     U.tween(ms, t => ...) runs an eased animation (t from 0 to 1); a new step finishes running tweens first. U.lerp(a, b, t).
     U.svg(w, h) appends a responsive <svg viewBox="0 0 w h"> to the body. U.el(parent, tag, attrs, text) creates an element. U.text(parent, x, y, str, {size, anchor, weight, color}). U.arrow(parent, x1, y1, x2, y2, {color, bend, dashed, both, width}). U.icon(parent, name, cx, cy, size, {color}) draws an icon centred at (cx, cy); U.iconHTML(name, size) returns it as markup for HTML layouts.
     U.mount(kind, spec, steps, parentElement) draws a kit visual inside your own layout, with steps given as [{reveal, focus}, ...].
     Without the kit, listen for window.postMessage({ type: "step", index, animate }) yourself and render step 0 on load.
   - Mathematics and science should move: grow, slide, trace, rearrange, flow. Show changing numbers next to the picture.
   - Keep it under about 10 KB. Make sure every step index you write is handled.

Icons (for nodes, points, events, columns and U.icon) are small line illustrations; use them to make a visual friendlier and easier to scan, one per element at most, only where they mean something. Available names: ${ICON_NAMES.join(', ')}.

"task" is one sentence telling the learner what to look at or try. "suggestions" are 2-3 short follow-up questions in the learner's voice, for every mode.`;
