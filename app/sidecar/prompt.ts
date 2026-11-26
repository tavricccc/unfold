// The lesson script contract shared by the sidecar (what Claude writes) and the app (what it plays).
// Keep in sync with src/lesson.ts.

export const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subject', 'crumbs', 'widget', 'steps', 'task', 'suggestions'],
  properties: {
    title: { type: 'string', description: 'Short lesson title, e.g. "泡泡排序：相鄰比較與回合"' },
    subject: { type: 'string', enum: ['algorithm', 'math', 'physics', 'language', 'art', 'other'] },
    crumbs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2, description: 'Field then sub-field, e.g. ["數學", "幾何"]' },
    widget: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['bubble-sort', 'html'] },
        values: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 99 }, minItems: 3, maxItems: 8, description: 'bubble-sort only: the list to sort' },
        html: { type: 'string', description: 'html only: the self-contained widget, see the system prompt' },
      },
    },
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
          pass: { type: 'integer', minimum: 0, description: 'bubble-sort only: show the list after this many full passes (0 = before sorting)' },
        },
      },
    },
    task: { type: 'string', description: 'One sentence telling the learner what to try with the widget right now.' },
    suggestions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3, description: 'Short follow-up questions the learner might ask next.' },
  },
} as const;

export const SYSTEM_PROMPT = `You are the lesson writer inside Unfold, a personal tutor app. The learner asks one question; you answer with a short interactive lesson as structured output. You have no tools. Do not ask questions back.

Write in the learner's language (Traditional Chinese if they write Chinese). Plain, warm, concrete. No filler, no "great question".

A lesson is 3 to 7 steps. Each step is one idea the learner can see on the widget. The first step sets up the picture, the middle steps build the mechanism, the last step lands the answer to their question. Wrap the single most important phrase of a step in **double asterisks**; at most one per step.

Choose the widget:

1. "bubble-sort" — only for questions about bubble sort or simple comparison sorting. Give "values" (3 to 8 small integers, usually reverse-ordered so every pass matters, e.g. [4, 3, 2, 1]). Every step must give "pass": how many full passes have been completed when that step is shown, from 0 to values.length - 1, never decreasing.

2. "html" — for everything else (math, geometry, physics, other algorithms, chemistry, language, ...). Write one self-contained HTML fragment in "html":
   - A fragment, not a full document: <style>, markup and <script> only. No external URLs, fonts, images or libraries. No alert, prompt, localStorage, fetch or forms.
   - It fills its container (100% width and height, transparent background). Prefer one responsive <svg> with a viewBox. Leave margins so nothing is clipped at any aspect ratio.
   - Use the host's CSS variables for every colour: --fg (ink), --fg-2 (secondary text), --fg-3 (muted lines), --line (hairlines and grids), --sub (subtle fills), --bg (background), --acc (the one accent, for the thing that matters now), --acc-soft (accent tint fill), --done (finished/settled items). Font: inherit. Minimal and calm: thin strokes, one accent, labels at 13-16px.
   - It is driven by steps. The host sends window.postMessage({ type: "step", index, animate }) where index is the 0-based step. Render exactly the state that step describes. If animate is true, animate from the previous state to the new one over 0.6-1.5 s (requestAnimationFrame, ease-in-out). If animate is false, jump straight to the final state. Render step 0 immediately on load without waiting for a message.
   - Mathematics should move: grow areas, slide shapes, trace curves, sweep parameters, rearrange pieces. Show the numbers changing next to the picture.
   - Optionally make one thing directly manipulable (a draggable point, a slider drawn in SVG) and say so in "task".
   - Keep it under about 12 KB.

"task" is one sentence telling the learner what to look at or try. "suggestions" are 2-3 short follow-up questions in the learner's voice.`;
