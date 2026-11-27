// Unfold sidecar: answers one question of a lesson through the Claude Agent SDK.
// Protocol: one JSON request on stdin, NDJSON events on stdout.
//   in:  { "question": string, "model"?: string, "effort"?: "low" | "medium" | "high" | "xhigh" | "max",
//          "askFirst"?: boolean, "refs"?: string[], "record"?: LessonRecord, "at"?: number, "answers"?: Answer[], "course"?: true }
//        Without "record" it is the first question of a new lesson ("askFirst": the learner wants to be
//        asked first). With it: "answers" are the learner's answers to Claude's questions (the lesson is
//        "asking"); "course" writes the course's remaining chapters; otherwise it is a follow-up asked
//        while reading chapter "at". Calls on a record resume its session (record.session) so Claude
//        keeps its own earlier answers in context; if that session cannot be resumed they start a new
//        one from an outline of the lesson.
//        A new lesson is answered with questions ("ask"), one chapter, or a course: an outline whose
//        chapters are then written one after another in the same session.
//        "refs" (a new lesson; later calls take record.refs) are folders Claude may read for the whole
//        lesson with Read, Glob and Grep, and nothing outside them. The files it reads for an answer
//        are kept with the answer as "sources".
//   out: { "type": "status", "text": string }
//        { "type": "session", "id": string }                   the session this lesson now lives in
//        { "type": "partial", "lesson": Draft }                mode, title, steps or text so far
//        { "type": "ask", "ask": Ask, "model", "cost" }        questions for the learner; the run ends
//        { "type": "outline", "course": Course, "model", "cost" }  a course's plan; chapters follow
//        { "type": "lesson", "lesson": Lesson, "model", "cost", "next"? }   the first chapter
//        { "type": "part", "part": Part, "model", "cost", "next"? }         a follow-up's answer, or a course chapter
//          "next": { "question": string, "at": number }, the course chapter written next, so the
//          lesson never shows the course as stopped between two chapters
//        { "type": "error", "message": string }
// Env: UNFOLD_CLAUDE_PATH, the Claude Code executable to drive (set by the app).
import { createSdkMcpServer, query, tool, type HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { chaptersOf, courseWritten, type Chapter } from '../src/chapters.ts';
import type { Answer as Reply, Ask, Cost, Course, Draft, Lesson, LessonRecord, Part, Widget } from '../src/lesson.ts';
import { problems } from './check.ts';
import { REF_TOOLS, refTarget, shortPath } from './refs.ts';
import { parsePartial } from './partial.ts';
import { RESPONSE_SCHEMA, SYSTEM_PROMPT, refsPrompt } from './prompt.ts';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
const READ_TOOL = 'mcp__unfold__read_chapter';
const emit = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

interface Req {
  question: string; model?: string; effort?: string; askFirst?: boolean; refs?: string[];
  record?: LessonRecord; at?: number; answers?: Reply[]; course?: boolean;
}

/** What Claude returns, before it is checked against its mode. */
interface Answer {
  mode: 'ask' | 'course' | 'chapter' | 'extend' | 'text';
  title?: string; subject?: Lesson['subject']; crumbs?: string[]; text?: string;
  questions?: Ask['questions']; outline?: Course['outline'];
  steps?: Lesson['steps']; task?: string; suggestions?: string[]; widget?: Widget;
  edits?: { find: string; replace: string }[];
}

/** How a new lesson starts: questions first, a course plan, or the one chapter. */
type Start =
  | { kind: 'ask'; ask: Ask }
  | { kind: 'course'; course: Course & { subject: Lesson['subject']; crumbs: string[] } }
  | { kind: 'lesson'; lesson: Lesson };

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

const lacking = (a: Answer, keys: readonly (keyof Answer)[]) =>
  keys.filter((k) => !a[k] || (Array.isArray(a[k]) && !(a[k] as unknown[]).length));

/** Turns a chapter answer into a chapter. */
function toLesson(a: Answer): Lesson {
  if (a.mode !== 'chapter') throw new Fixable([`this answer must be a chapter (mode "chapter"), got "${a.mode}"`]);
  const lacks = lacking(a, ['title', 'steps', 'task', 'subject', 'crumbs']);
  if (lacks.length) throw new Fixable([`a chapter needs ${lacks.join(', ')}`]);
  return { title: a.title!, subject: a.subject!, crumbs: a.crumbs!, steps: a.steps!, task: a.task!, suggestions: a.suggestions ?? [], widget: checkWidget(a.widget, a.steps!) };
}

/** Turns the first answer of a new lesson into how it starts; `mayAsk` is false once the learner answered. */
function toStart(a: Answer, mayAsk: boolean): Start {
  if (a.mode === 'ask') {
    if (!mayAsk) throw new Fixable(['the learner already answered your questions; do not ask again, teach with "chapter" or "course"']);
    const qs = (a.questions ?? []).filter((q) => q.text?.trim() && q.options?.length >= 2);
    if (!qs.length) throw new Fixable(['ask needs questions, each with at least two options']);
    return { kind: 'ask', ask: { ...(a.text?.trim() ? { text: a.text.trim() } : {}), questions: qs } };
  }
  if (a.mode === 'course') {
    const lacks = lacking(a, ['title', 'subject', 'crumbs', 'outline']);
    if (lacks.length) throw new Fixable([`a course needs ${lacks.join(', ')}`]);
    if (a.outline!.length < 2) throw new Fixable(['a course needs at least two chapters; for one, answer with "chapter"']);
    return { kind: 'course', course: { title: a.title!, subject: a.subject!, crumbs: a.crumbs!, outline: a.outline! } };
  }
  if (a.mode !== 'chapter') throw new Fixable([`a new lesson starts with "ask", "course" or "chapter", got "${a.mode}"`]);
  return { kind: 'lesson', lesson: toLesson(a) };
}

const answersText = (ask: Ask | undefined, answers: Reply[]) => answers.length
  ? `學生的回答：\n${answers.map((r) => `- ${r.question}：${r.answer}`).join('\n')}\n請依照這些回答開始教：用 "chapter"（一章講清楚）或 "course"（一整課），不要再問。`
  : `學生跳過了你的問題${ask ? `（${ask.questions.map((q) => q.text).join('；')}）` : ''}，請你自己判斷怎麼教最好：用 "chapter" 或 "course"，不要再問。`;

const chapterAsk = (course: Course, k: number) =>
  `現在寫第 ${k + 1} 章（共 ${course.outline.length} 章）：「${course.outline[k].title}」——${course.outline[k].goal}\n用 "chapter" 回答，接著前面的章節教，不重複已經教過的。`;

/** Turns a follow-up answer into a part, with any html edits applied to the chapter's current visual. */
function toPart(a: Answer, q: string, chs: Chapter[], at: number): Part {
  if (a.mode === 'ask' || a.mode === 'course') throw new Fixable([`"${a.mode}" is only for the first answer of a new lesson; answer this follow-up with "chapter", "extend" or "text"`]);
  const base = { question: q, mode: a.mode, suggestions: a.suggestions ?? [] };
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
  // fixed for the lesson's whole life, so its tools and system prompt never change between calls
  const refs = (rec ? rec.refs : req.refs)?.filter((r) => typeof r === 'string' && isAbsolute(r)) ?? [];
  /** the files read for the answer being written, shown to the learner as its sources */
  const reads = new Set<string>();
  const sourced = <T extends object>(v: T): T => {
    const sources = [...reads];
    reads.clear();
    return sources.length ? { ...v, sources } : v;
  };
  /** Keeps every file tool call inside the reference folders, whatever Claude Code would allow on its own. */
  const guard: HookCallback = async (input) => {
    if (input.hook_event_name !== 'PreToolUse' || !REF_TOOLS.includes(input.tool_name)) return {};
    const t = refTarget(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>, refs);
    if ('deny' in t) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: t.deny } };
    if (input.tool_name === 'Read') reads.add(shortPath(t.path, refs));
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  };

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
  /** while a course is written: which chapter, shown before every status */
  let prefix = '';
  const setPhase = (p: string) => { if (prefix + p !== phase) { phase = prefix + p; emit({ type: 'status', text: phase }); } };

  /** One run. Returns the answer and the run's cost; `shown` tells whether the learner saw any of it. */
  const run = async (prompt: string, resume: string | undefined, shown: { any: boolean }) => {
    let json = '';
    let block = '';
    let sent = '';
    const q = query({
      prompt,
      options: {
        systemPrompt: refs.length ? `${SYSTEM_PROMPT}\n\n${refsPrompt(refs)}` : SYSTEM_PROMPT,
        model,
        ...(effort ? { effort } : {}),
        ...(resume ? { resume } : {}),
        tools: refs.length ? [...REF_TOOLS, WEB_SEARCH] : [WEB_SEARCH],
        mcpServers: { unfold },
        allowedTools: [READ_TOOL, WEB_SEARCH],
        settingSources: [],
        // reading a project, or searching for current facts, takes turns of its own
        maxTurns: refs.length ? 48 : 16,
        ...(refs.length ? {
          additionalDirectories: refs,
          hooks: { PreToolUse: [{ matcher: REF_TOOLS.join('|'), hooks: [guard] }] },
          canUseTool: async (name: string, input: Record<string, unknown>) => {
            if (name === WEB_SEARCH) return { behavior: 'allow' as const, updatedInput: input };
            const t = REF_TOOLS.includes(name) ? refTarget(name, input, refs) : { deny: `${name} is not available` };
            return 'deny' in t ? { behavior: 'deny' as const, message: t.deny } : { behavior: 'allow' as const, updatedInput: input };
          },
        } : {}),
        includePartialMessages: true,
        outputFormat: { type: 'json_schema', schema: RESPONSE_SCHEMA },
        ...(process.env.UNFOLD_CLAUDE_PATH ? { pathToClaudeCodeExecutable: process.env.UNFOLD_CLAUDE_PATH } : {}),
      },
    });
    for await (const m of q as AsyncIterable<any>) {
      if (m.type === 'assistant' && m.error && ACCOUNT_ERRORS[m.error]) throw new AccountError(ACCOUNT_ERRORS[m.error]);
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
          if (block === WEB_SEARCH) setPhase('正在網路上查最新資料…');
          if (REF_TOOLS.includes(block)) setPhase(block === 'Read' ? '正在讀資料…' : block === 'Glob' ? '正在看資料夾裡有什麼…' : '正在資料裡搜尋…');
        }
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta' && (REF_TOOLS.includes(block) || block === WEB_SEARCH)) {
          json += ev.delta.partial_json;
          continue;
        }
        if (ev?.type === 'content_block_stop' && block === WEB_SEARCH) {
          try {
            const inp = JSON.parse(json || '{}');
            if (typeof inp.query === 'string') setPhase(`正在網路上查「${inp.query.slice(0, 40)}」…`);
          } catch { /* the call itself is checked by Claude Code */ }
          block = '';
          continue;
        }
        if (ev?.type === 'content_block_stop' && REF_TOOLS.includes(block)) {
          try {
            const inp = JSON.parse(json || '{}');
            const where = typeof inp.file_path === 'string' ? shortPath(resolve(inp.file_path), refs) : typeof inp.path === 'string' ? shortPath(resolve(inp.path), refs) : '';
            if (block === 'Read' && where) setPhase(`正在讀 ${where}…`);
            else if (block === 'Grep' && typeof inp.pattern === 'string') setPhase(`正在搜尋「${inp.pattern.slice(0, 40)}」…`);
            else if (block === 'Glob' && where) setPhase(`正在看 ${where} 裡有什麼…`);
          } catch { /* a call that does not parse is refused by Claude Code itself */ }
          block = '';
          continue;
        }
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta' && block !== READ_TOOL) {
          json += ev.delta.partial_json;
          const d = parsePartial(json) as (Draft & { widget?: { kind?: string } }) | undefined;
          if (!d) continue;
          const { widget, ...rest } = d;
          const draft: Draft = { mode: rest.mode, title: rest.title, steps: rest.steps, crumbs: rest.crumbs };
          if (rest.mode === 'text') draft.text = streamingText(json) ?? rest.text;
          // questions and a course plan arrive whole; only their title or opening line streams
          if (rest.mode === 'ask') { draft.text = rest.text; setPhase('正在想要先問你什麼…'); }
          if (rest.mode === 'course') setPhase('正在規劃整課…');
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

  /**
   * Writes the course's chapters from `from` on, in the current session; `first`, when given, runs
   * the first of them (to resume or rebuild a session).
   */
  const writeCourse = async (course: Course, from: number, written: number, first?: (prompt: string) => ReturnType<typeof run>) => {
    const n = course.outline.length;
    for (let k = from; k < n; k++) {
      prefix = `第 ${k + 1} / ${n} 章 · `;
      setPhase('正在想怎麼教…');
      const r = k === from && first ? await first(chapterAsk(course, k)) : await run(chapterAsk(course, k), sid, { any: false });
      const settled = await settle(r, toLesson);
      const value = sourced(settled.value), cost = settled.cost;
      written++;
      const next = k + 1 < n ? { question: course.outline[k + 1].goal, at: written - 1 } : undefined;
      if (k === 0) emit({ type: 'lesson', lesson: value, model, cost, next });
      else emit({ type: 'part', part: { question: course.outline[k].goal, mode: 'chapter', course: true, lesson: value, suggestions: value.suggestions }, model, cost, next });
    }
  };

  /** Plays out how a new lesson starts. */
  const begin = async (first: { answer: Answer; cost: Cost }, mayAsk: boolean) => {
    const { value, cost } = await settle(first, (a) => toStart(a, mayAsk));
    if (value.kind === 'ask') { reads.clear(); return emit({ type: 'ask', ask: value.ask, model, cost }); }
    if (value.kind === 'lesson') return emit({ type: 'lesson', lesson: sourced(value.lesson), model, cost });
    // what was read to plan the course counts toward its first chapter
    emit({ type: 'outline', course: value.course, model, cost });
    await writeCourse(value.course, 0, 0);
  };

  if (!rec) {
    const wish = req.askFirst ? '\n（學生打開了「先問我」：這次先用 "ask" 問清楚再教。）' : '';
    await begin(await run(`新的一課。學生問：${req.question}${wish}`, undefined, { any: false }), true);
    return;
  }

  // Resumes the lesson's session, or starts a new one from `fresh()` when it cannot be resumed.
  const resumeOr = async (prompt: string, fresh: () => string) => {
    if (rec.session) {
      const shown = { any: false };
      try {
        return await run(prompt, rec.session, shown);
      } catch (e) {
        // A session Claude Code no longer has (or one that broke) starts over from the outline,
        // unless the learner already saw part of this answer.
        if (shown.any || e instanceof AccountError) throw e;
        console.error(`resume failed, starting a new session: ${e instanceof Error ? e.message : e}`);
        setPhase('正在重新讀這一課…');
      }
    }
    return run(fresh(), undefined, { any: false });
  };

  if (req.answers) {
    const reply = answersText(rec.ask, req.answers);
    const asked = rec.ask ? `你先問了學生：\n${rec.ask.questions.map((q) => `- ${q.text}（${q.options.join('／')}）`).join('\n')}\n` : '';
    await begin(await resumeOr(reply, () => `新的一課。學生問：${rec.question}\n${asked}${reply}`), false);
    return;
  }

  if (req.course) {
    const course = rec.course;
    const from = courseWritten(rec);
    if (!course || from >= course.outline.length) throw new Error('這一課沒有還沒寫的章節');
    // a resumed session only needs the next chapter asked; a new one first reads the lesson so far
    const plan = course.outline.map((c, k) => `${k + 1}. ${c.title}：${c.goal}`).join('\n');
    const intro = `這是一堂整課「${course.title}」，你在新的對話裡接手，接下來會一章一章寫下去。課綱：\n${plan}\n\n已經寫好的內容（步驟前的數字是視覺用的步驟編號）：\n\n${outline(chs)}`;
    await writeCourse(course, from, chs.length, (p) => resumeOr(p, () => `${intro}\n\n${p}`));
    return;
  }

  const ask = `${where(chs, at)}\n學生追問：${req.question}`;
  const fresh = `這是一堂已經在上的課，你在新的對話裡接手。以下是到目前為止的內容（步驟前的數字是視覺用的步驟編號）：\n\n${outline(chs)}\n\n要看某一章現在的完整視覺與步驟，用 read_chapter。\n\n${ask}`;
  const result = await resumeOr(ask, () => fresh);
  const { value, cost } = await settle(result, (a) => toPart(a, req.question, chs, at));
  emit({ type: 'part', part: value.lesson ? { ...value, lesson: sourced(value.lesson) } : sourced(value), model, cost });
}

/** Claude Code's own web search, offered in every lesson for facts that change over time. */
const WEB_SEARCH = 'WebSearch';

/** Problems with the learner's Claude account: retrying or a new session cannot fix them. */
class AccountError extends Error {}
const LOGIN = 'Claude Code 還沒登入：在終端機執行 claude，用 /login 登入後再試一次';
const ACCOUNT_ERRORS: Record<string, string> = {
  authentication_failed: LOGIN,
  oauth_org_not_allowed: '這個 Claude 帳號的組織不允許使用 Claude Code',
  account_on_hold: '這個 Claude 帳號目前被暫停',
  verification_required: 'Claude 帳號需要先完成驗證：在終端機執行 claude 照提示操作',
  billing_error: 'Claude 帳號的付款或用量有問題，請到 claude.ai 確認',
};

/** What the learner sees for a failure: account problems in plain words, anything else as it came. */
function explain(e: unknown): string {
  if (e instanceof AccountError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/not logged in|please run \/login|invalid api key|authentication_failed|\b401\b/i.test(msg)) return LOGIN;
  return msg;
}

main().catch((e) => {
  emit({ type: 'error', message: explain(e) });
  process.exitCode = 1;
});
