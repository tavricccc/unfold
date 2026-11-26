// Unfold sidecar: turns one question into a lesson script through the Claude Agent SDK.
// Protocol: one JSON request on stdin, NDJSON events on stdout.
//   in:  { "question": string, "model"?: string, "effort"?: "low" | "medium" | "high" | "xhigh" | "max" }
//   out: { "type": "status", "text": string }
//        { "type": "partial", "lesson": Partial<Lesson> }   title/steps so far, no widget
//        { "type": "lesson", "lesson": Lesson, "model": string }
//        { "type": "error", "message": string }
// Env: UNFOLD_CLAUDE_PATH, the Claude Code executable to drive (set by the app).
import { query } from '@anthropic-ai/claude-agent-sdk';
import { parsePartial } from './partial.ts';
import { LESSON_SCHEMA, SYSTEM_PROMPT } from './prompt.ts';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

const emit = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

type Draft = { title?: string; steps?: { text: string }[]; widget?: { kind?: string } };

async function main() {
  const req = JSON.parse(await readStdin()) as { question: string; model?: string; effort?: string };
  if (!req.question?.trim()) throw new Error('empty question');

  emit({ type: 'status', text: '正在讀你的問題…' });
  let model = req.model ?? 'sonnet';
  // Left out, the model runs at its own default; a level the model lacks is lowered by Claude Code.
  const effort = EFFORTS.find((e) => e === req.effort);
  let json = '';
  let sent = '';
  let phase = '';
  const setPhase = (p: string) => { if (p !== phase) { phase = p; emit({ type: 'status', text: p }); } };

  const q = query({
    prompt: req.question,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      ...(effort ? { effort } : {}),
      tools: [],
      settingSources: [],
      maxTurns: 4,
      includePartialMessages: true,
      outputFormat: { type: 'json_schema', schema: LESSON_SCHEMA },
      ...(process.env.UNFOLD_CLAUDE_PATH ? { pathToClaudeCodeExecutable: process.env.UNFOLD_CLAUDE_PATH } : {}),
    },
  });

  for await (const m of q as AsyncIterable<any>) {
    if (m.type === 'system' && m.subtype === 'init' && m.model) model = m.model;
    if (m.type === 'stream_event') {
      const ev = m.event;
      if (ev?.type === 'message_start') setPhase('正在想怎麼教…');
      if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') json = '';
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta') {
        json += ev.delta.partial_json;
        const d = parsePartial(json) as Draft | undefined;
        if (!d) continue;
        const { widget, ...rest } = d;
        const key = `${rest.title ?? ''}|${rest.steps?.length ?? 0}`;
        if (rest.title && key !== sent) { sent = key; emit({ type: 'partial', lesson: rest }); }
        if (widget) setPhase(widget.kind === 'bubble-sort' ? '正在排好要比的數字…' : '正在畫給你看…');
        else if (rest.steps?.length) setPhase('正在寫步驟…');
      }
    }
    if (m.type === 'result') {
      if (m.subtype === 'success' && m.structured_output) {
        emit({ type: 'lesson', lesson: m.structured_output, model });
        return;
      }
      throw new Error(`generation failed: ${m.subtype}${m.errors ? ' ' + JSON.stringify(m.errors) : ''}`);
    }
  }
  throw new Error('generation ended without a result');
}

main().catch((e) => {
  emit({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
});
