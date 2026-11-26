// Unfold sidecar: turns one question into a lesson script through the Claude Agent SDK.
// Protocol: one JSON request on stdin, NDJSON events on stdout.
//   in:  { "question": string, "model"?: string }
//   out: { "type": "status", "text": string }
//        { "type": "lesson", "lesson": Lesson, "model": string }
//        { "type": "error", "message": string }
import { query } from '@anthropic-ai/claude-agent-sdk';
import { LESSON_SCHEMA, SYSTEM_PROMPT } from './prompt.ts';

const emit = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const req = JSON.parse(await readStdin()) as { question: string; model?: string };
  if (!req.question?.trim()) throw new Error('empty question');

  emit({ type: 'status', text: '正在讀你的問題…' });
  let model = req.model ?? 'sonnet';
  let sawStream = false;

  const q = query({
    prompt: req.question,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools: [],
      settingSources: [],
      maxTurns: 4,
      includePartialMessages: true,
      outputFormat: { type: 'json_schema', schema: LESSON_SCHEMA },
    },
  });

  for await (const m of q as AsyncIterable<any>) {
    if (m.type === 'system' && m.subtype === 'init' && m.model) model = m.model;
    if (m.type === 'stream_event' && !sawStream) {
      sawStream = true;
      emit({ type: 'status', text: '正在想怎麼畫給你看…' });
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
