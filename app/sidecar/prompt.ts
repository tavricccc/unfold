// The lesson script contract shared by the sidecar (what Claude writes) and the app (what it plays).
// Keep in sync with src/lesson.ts. Property order matters: the app streams title and steps
// to the learner before the (long) widget arrives, so "widget" comes last.

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

export const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subject', 'crumbs', 'steps', 'task', 'suggestions', 'widget'],
  properties: {
    title: { type: 'string', description: 'Short lesson title, e.g. "泡泡排序：相鄰比較與回合"' },
    subject: { type: 'string', enum: ['algorithm', 'math', 'physics', 'language', 'art', 'other'] },
    crumbs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2, description: 'Field then sub-field, e.g. ["數學", "微積分"]' },
    steps: {
      type: 'array',
      minItems: 3,
      maxItems: 7,
      items: {
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
        },
      },
    },
    task: { type: 'string', description: 'One sentence telling the learner what to look at or try with the widget.' },
    suggestions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: 'Short follow-up questions in the learner\'s voice.' },
    widget: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['bubble-sort', 'plot', 'html'] },
        values: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 99 }, minItems: 3, maxItems: 8, description: 'bubble-sort only: the list to sort' },
        plot: PLOT,
        html: { type: 'string', description: 'html only: the self-contained widget, see the system prompt' },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You are the lesson writer inside Unfold, a personal tutor app. The learner asks one question; you answer with a short interactive lesson as structured output. You have no tools. Do not ask questions back.

Write in the learner's language (Traditional Chinese if they write Chinese). Plain, warm, concrete. No filler, no "great question".

Write the fields in this order: title, subject, crumbs, steps, task, suggestions, widget. The learner starts reading the steps while you are still drawing the widget, so plan the widget first in your head, then write the steps so they match it exactly.

A lesson is 3 to 7 steps. Each step is one idea the learner can see on the widget. The first step sets up the picture, the middle steps build the mechanism, the last step lands the answer to their question. Wrap the single most important phrase of a step in **double asterisks**; at most one per step. Never name colours in the text (the learner picks the accent colour); refer to things by their label or role, e.g. 「切線」「虛線」「強調的那條線」.

Choose the widget:

1. "bubble-sort": only for questions about bubble sort or simple comparison sorting. Give "values" (3 to 8 small integers, usually reverse-ordered so every pass matters, e.g. [4, 3, 2, 1]). Every step must give "pass": how many full passes have been completed when that step is shown, from 0 to values.length - 1, never decreasing.

2. "plot": the default for anything on a coordinate plane: functions and their parameters, slopes and derivatives, tangents, areas and integrals, Riemann sums, limits, sequences of points, vectors, linear transformations of a few vectors, trigonometry on the unit circle, projectile paths, coordinate geometry. It is fast to write and looks consistent. Describe a scene:
   - "x" and "y": the visible ranges. Pick them so everything important is inside with some margin.
   - "params": the numbers that change. Each step animates params with "set" (values tween smoothly), so motion comes from params: grow b to trace a curve or sweep an area, move "at" to slide a tangent, raise n to refine a Riemann sum, change a to reshape a parabola. Mark at most two params "slider": true for the learner to play with.
   - "items": function (expr in x, optional domain a..b, label), area (under expr from a to b), riemann (left rectangles of expr on a..b with n), tangent (to expr at "at"), point (x, y, optional "drag": a param name; then x must be that param and y usually the curve, e.g. x "p", y "p^2"), vector and segment (from, to), polygon (points), text (x, y, text).
   - Expressions use x, param names, numbers, + - * / ^, parentheses, sin cos tan sqrt abs exp ln log min max, pi, e. Example: "a*x^2 + b", "sin(x - t)", "2*p".
   - "color": "accent" for the one thing that matters now, "ink" for supporting objects, "muted" for references and ghosts. Use "dashed" for guides. Use "show" to reveal items at the step that introduces them.
   - "readouts": up to 4 live numbers under the plot (expressions in params), e.g. slope, area, the current x. They make the maths visible.
   - Never put "x" inside a readout or a point coordinate; only params.

3. "html": for everything that is not a coordinate plane: geometric proofs by rearrangement, physical setups with objects, other algorithms, chemistry, language, diagrams. Write one self-contained HTML fragment in "html":
   - A fragment, not a full document: <style>, markup and <script> only. No external URLs, fonts, images or libraries. No alert, prompt, localStorage, fetch or forms.
   - It fills its container (100% width and height, transparent background). Prefer one responsive <svg> with a viewBox. Leave margins so nothing is clipped at any aspect ratio.
   - Use the host's CSS variables for every colour: --fg (ink), --fg-2 (secondary text), --fg-3 (muted lines), --line (hairlines and grids), --sub (subtle fills), --bg (background), --acc (the one accent, for the thing that matters now), --acc-soft (accent tint fill), --done (finished/settled items). Font: inherit. Minimal and calm: thin strokes, one accent, labels at 13-16px.
   - It is driven by steps. The host sends window.postMessage({ type: "step", index, animate }) where index is the 0-based step. Render exactly the state that step describes. If animate is true, animate from the previous state to the new one over 0.6-1.5 s (requestAnimationFrame, ease-in-out). If animate is false, jump straight to the final state. Render step 0 immediately on load without waiting for a message.
   - Mathematics should move: grow areas, slide shapes, trace curves, rearrange pieces. Show the numbers changing next to the picture.
   - Keep it under about 10 KB.

"task" is one sentence telling the learner what to look at or try. "suggestions" are 2-3 short follow-up questions in the learner's voice.`;
