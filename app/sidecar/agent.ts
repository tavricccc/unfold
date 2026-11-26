// Unfold sidecar: answers one question of a lesson through the Claude Agent SDK.
// Protocol: one JSON request on stdin, NDJSON events on stdout.
//   in:  { "question": string, "model"?: string, "effort"?: "low" | "medium" | "high" | "xhigh" | "max",
//          "record"?: LessonRecord, "at"?: number }
//        Without "record" it is the first question of a new lesson; with it, a follow-up asked while
//        reading chapter "at". A follow-up resumes the lesson's session (record.session) so Claude
//        keeps its own earlier answers in context; if that session cannot be resumed it starts a new
//        one from an outline of the lesson.
//   out: { "type": "status", "text": string }
//        { "type": "session", "id": string }                   the session this lesson now lives in
//        { "type": "partial", "lesson": Draft }                mode, title, steps or text so far
//        { "type": "lesson", "lesson": Lesson, "model", "cost" }   the first answer
//        { "type": "part", "part": Part, "model", "cost" }         a follow-up's answer
//        { "type": "error", "message": string }
// Env: UNFOLD_CLAUDE_PATH, the Claude Code executable to drive (set by the app).
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { chaptersOf, type Chapter } from '../src/chapters.ts';
import type { Cost, Draft, Lesson, LessonRecord, Part, Widget } from '../src/lesson.ts';
import { problems } from './check.ts';
import { parsePartial } from './partial.ts';
import { RESPONSE_SCHEMA, SYSTEM_PROMPT } from './prompt.ts';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const READ_TOOL = 'mcp__unfold__read_chapter';

const emit = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

interface Req { question: string; model?: string; effort?: string; record?: LessonRecord; at?: number }

/** What Claude returns, before it is checked against its mode. */
interface Answer {
  mode: 'chapter' | 'extend' | 'text';
  title?: string; subject?: Lesson['subject']; crumbs?: string[]; text?: string;
  steps?: Lesson['steps']; task?: string; suggestions: string[]; widget?: Widget;
  edits?: { find: string; replace: string }[];
}

/** One chapter as it is now, for read_chapter. */
function chapterView(ch: Chapter, n: number) {
  const replies = ch.items.filter((it) => it.kind === 'text').map((it) => ({ afterStep: it.local, question: it.asked, text: it.text }));
  return {
    chapter: n + 1, title: ch.title, question: ch.question, task: ch.tasks[ch.tasks.length - 1],
    steps: ch.steps.map((st, index) => ({ index, ...st })),
    replies, visualVersions: ch.versions.length, currentVisual: ch.versions[ch.versions.length - 1],
  };
}

/** The lesson in words, for a new session that has not seen it. */
function outline(chs: Chapter[]) {
  return chs.map((ch, n) => {
    const lines = ch.items.map((it) => {
      const q = it.asked ? `（學生追問：${it.asked}）\n` : '';
      return it.kind === 'step' ? `${q}${it.local}. ${it.text}` : `${q}（文字回覆）${it.text}`;
    });
    return `第 ${n + 1} 章「${ch.title}」（學生問：${ch.question}）\n${lines.join('\n')}`;
  }).join('\n\n');
}

function where(chs: Chapter[], at: number) {
  const ch = chs[at];
  return `學生正在讀第 ${at + 1} 章「${ch.title}」，這一章目前有 ${ch.steps.length} 步（編號 0 到 ${ch.steps.length - 1}），視覺是 ${ch.versions[ch.versions.length - 1].kind}。`;
}

/** Text of a string value that is still being streamed, for a text-only reply. */
function streamingText(json: string): string | undefined {
  const m = /"text"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(json);
  if (!m) return undefined;
  try { return JSON.parse(`"${m[1].replace(/\\+$/, (b) => (b.length % 2 ? b.slice(1) : b))}"`); } catch { return undefined; }
}

/** A written answer with problems Claude can repair. */
class Fixable extends Error {
  constructor(readonly issues: string[]) { super(`the answer has problems: ${issues.join('; ')}`); }
}

function checkWidget(w: Widget | undefined, steps: Lesson['steps']): Widget {
  if (!w) throw new Fixable(['the chapter has no widget']);
  const bad = problems(w, steps);
  if (bad.length) throw new Fixable(bad);
  return w;
}

/** Turns a first answer into the lesson. */
function toLesson(a: Answer): Lesson {
  if (a.mode !== 'chapter') throw new Error(`a new lesson must start with a chapter, got ${a.mode}`);
  const lacks = (['title', 'steps', 'task', 'subject', 'crumbs'] as const).filter((k) => !a[k] || (Array.isArray(a[k]) && !(a[k] as unknown[]).length));
  if (lacks.length) throw new Fixable([`a chapter needs ${lacks.join(', ')}`]);
  return { title: a.title!, subject: a.subject!, crumbs: a.crumbs!, steps: a.steps!, task: a.task!, suggestions: a.suggestions, widget: checkWidget(a.widget, a.steps!) };
}

/** Turns a follow-up answer into a part, with any html edits applied to the chapter's current visual. */
function toPart(a: Answer, q: string, chs: Chapter[], at: number): Part {
  const base = { question: q, mode: a.mode, suggestions: a.suggestions };
  if (a.mode === 'chapter') return { ...base, lesson: toLesson(a) };
  if (a.mode === 'text') {
    if (!a.text?.trim()) throw new Fixable(['the text reply is empty']);
    return { ...base, at, text: a.text };
  }
  if (!a.steps?.length) throw new Fixable(['extend needs steps']);
  const ch = chs[at];
  const all = [...ch.steps, ...a.steps];
  let widget: Widget | undefined;
  if (a.widget) widget = checkWidget(a.widget, all);
  else if (a.edits?.length) {
    const cur = ch.versions[ch.versions.length - 1];
    if (cur.kind !== 'html' || !cur.html) throw new Fixable(['edits only apply to an html visual; send a whole widget instead']);
    let html = cur.html;
    for (const e of a.edits) {
      const k = html.indexOf(e.find);
      if (k < 0) throw new Fixable([`an edit's "find" text does not occur in the current html (call read_chapter to see it): ${e.find.slice(0, 80)}`]);
      html = html.slice(0, k) + e.replace + html.slice(k + e.find.length);
    }
    widget = checkWidget({ kind: 'html', html }, all);
  } else {
    // new steps on the same visual must still point at things it has
    const bad = problems(ch.versions[ch.versions.length - 1], all);
    if (bad.length) throw new Fixable(bad);
  }
  return { ...base, at, steps: a.steps, ...(widget ? { widget, ...(a.task ? { task: a.task } : {}) } : {}) };
}

async function main() {
  const req = JSON.parse(await readStdin()) as Req;
  if (!req.question?.trim()) throw new Error('empty question');
  const rec = req.record;
  const chs = rec ? chaptersOf(rec) : [];
  const at = Math.max(0, Math.min(req.at ?? chs.length - 1, chs.length - 1));

  emit({ type: 'status', text: rec ? '正在讀你的追問…' : '正在讀你的問題…' });
  let model = req.model ?? 'sonnet';
  // Left out, the model runs at its own default; a level the model lacks is lowered by Claude Code.
  const effort = EFFORTS.find((e) => e === req.effort);

  // Always offered, so the tools Claude sees never change between a lesson's calls.
  const unfold = createSdkMcpServer({
    name: 'unfold', version: '1.0.0',
    tools: [tool(
      'read_chapter',
      'Read one chapter of this lesson as it is now: its steps (with the indices the visual uses), text replies, and the full current visual after earlier edits.',
      { chapter: z.number().int().min(1).describe('1-based chapter number') },
      async ({ chapter }) => {
        const ch = chs[chapter - 1];
        const body = ch ? JSON.stringify(chapterView(ch, chapter - 1)) : `There is no chapter ${chapter}; this lesson has ${chs.length}.`;
        return { content: [{ type: 'text', text: body }] };
      },
      { alwaysLoad: true },
    )],
  });

  let sid: string | undefined;
  let phase = '';
  const setPhase = (p: string) => { if (p !== phase) { phase = p; emit({ type: 'status', text: p }); } };

  /** One run. Returns the answer and the run's cost; `shown` tells whether the learner saw any of it. */
  const run = async (prompt: string, resume: string | undefined, shown: { any: boolean }) => {
    let json = '';
    let block = '';
    let sent = '';
    const q = query({
      prompt,
      options: {
        systemPrompt: SYSTEM_PROMPT,
        model,
        ...(effort ? { effort } : {}),
        ...(resume ? { resume } : {}),
        tools: [],
        mcpServers: { unfold },
        allowedTools: [READ_TOOL],
        settingSources: [],
        maxTurns: 8,
        includePartialMessages: true,
        outputFormat: { type: 'json_schema', schema: RESPONSE_SCHEMA },
        ...(process.env.UNFOLD_CLAUDE_PATH ? { pathToClaudeCodeExecutable: process.env.UNFOLD_CLAUDE_PATH } : {}),
      },
    });
    for await (const m of q as AsyncIterable<any>) {
      if (m.type === 'system' && m.subtype === 'init') {
        if (m.model) model = m.model;
        if (m.session_id) { sid = m.session_id; emit({ type: 'session', id: m.session_id }); }
      }
      if (m.type === 'stream_event') {
        const ev = m.event;
        if (ev?.type === 'message_start') setPhase('正在想怎麼教…');
        if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
          block = ev.content_block.name ?? '';
          json = '';
          if (block === READ_TOOL) setPhase('正在看前面寫過的內容…');
        }
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta' && block !== READ_TOOL) {
          json += ev.delta.partial_json;
          const d = parsePartial(json) as (Draft & { widget?: { kind?: string } }) | undefined;
          if (!d) continue;
          const { widget, ...rest } = d;
          const draft: Draft = { mode: rest.mode, title: rest.title, steps: rest.steps, crumbs: rest.crumbs };
          if (rest.mode === 'text') draft.text = streamingText(json) ?? rest.text;
          const key = `${draft.mode}|${draft.title ?? ''}|${draft.steps?.length ?? 0}|${Math.floor((draft.text?.length ?? 0) / 12)}`;
          if ((draft.title || draft.text || draft.steps?.length) && key !== sent) {
            sent = key; shown.any = true;
            emit({ type: 'partial', lesson: draft });
          }
          if (widget || (rest as Answer).edits) setPhase(widget?.kind === 'bubble-sort' ? '正在排好要比的數字…' : '正在畫給你看…');
          else if (draft.text) setPhase('正在回答…');
          else if (draft.steps?.length) setPhase('正在寫步驟…');
        }
      }
      if (m.type === 'result') {
        if (m.subtype === 'success' && m.structured_output) {
          const u = m.usage ?? {};
          const cost: Cost = {
            usd: m.total_cost_usd ?? 0,
            input: u.input_tokens ?? 0, output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0,
          };
          return { answer: m.structured_output as Answer, cost };
        }
        throw new Error(`generation failed: ${m.subtype}${m.errors ? ' ' + JSON.stringify(m.errors) : ''}`);
      }
    }
    throw new Error('generation ended without a result');
  };

  /**
   * Converts an answer; when it has problems Claude can fix, asks once in the same session for a
   * corrected answer. The costs of both runs are added up.
   */
  const settle = async <T,>(first: { answer: Answer; cost: Cost }, convert: (a: Answer) => T): Promise<{ value: T; cost: Cost }> => {
    try {
      return { value: convert(first.answer), cost: first.cost };
    } catch (e) {
      if (!(e instanceof Fixable) || !sid) throw e;
      console.error(`repairing: ${e.message}`);
      setPhase('正在檢查並修正…');
      const fix = await run(`你剛才的回答有這些問題，學生還沒看到它：\n- ${e.issues.join('\n- ')}\n請修正後重新輸出完整的回答（同樣的 mode，內容不變，只修正問題）。`, sid, { any: false });
      const c = fix.cost, p = first.cost;
      return { value: convert(fix.answer), cost: { usd: p.usd + c.usd, input: p.input + c.input, output: p.output + c.output, cacheRead: p.cacheRead + c.cacheRead, cacheWrite: p.cacheWrite + c.cacheWrite } };
    }
  };

  if (!rec) {
    const first = await run(`新的一課。學生問：${req.question}`, undefined, { any: false });
    const { value, cost } = await settle(first, toLesson);
    emit({ type: 'lesson', lesson: value, model, cost });
    return;
  }

  const ask = `${where(chs, at)}\n學生追問：${req.question}`;
  const fresh = `這是一堂已經在上的課，你在新的對話裡接手。以下是到目前為止的內容（步驟前的數字是視覺用的步驟編號）：\n\n${outline(chs)}\n\n要看某一章現在的完整視覺與步驟，用 read_chapter。\n\n${ask}`;
  let result;
  if (rec.session) {
    const shown = { any: false };
    try {
      result = await run(ask, rec.session, shown);
    } catch (e) {
      // A session Claude Code no longer has (or one that broke) starts over from the outline,
      // unless the learner already saw part of this answer.
      if (shown.any) throw e;
      console.error(`resume failed, starting a new session: ${e instanceof Error ? e.message : e}`);
      setPhase('正在重新讀這一課…');
    }
  }
  result ??= await run(fresh, undefined, { any: false });
  const { value, cost } = await settle(result, (a) => toPart(a, req.question, chs, at));
  emit({ type: 'part', part: value, model, cost });
}

main().catch((e) => {
  emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
});
