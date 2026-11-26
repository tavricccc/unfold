# Unfold

A personal interactive tutor. Ask a question; your local Claude Code (through the Agent SDK) writes a lesson script, and the app plays it step by step on an interactive widget.

## Run

```sh
bun install
bun run tauri dev
```

Needs Claude Code installed and signed in (`claude --version`), plus Rust and Bun.
Set `CARGO_TARGET_DIR` to keep Rust build output elsewhere (e.g. a RAM disk).

`bun run dev` alone opens the UI in a browser with recorded sample lessons and a fake generator, for layout work without Claude.

## How it fits

- `sidecar/agent.ts` — one question in on stdin, NDJSON events out (`status`, `lesson`, `error`). Calls the Agent SDK with no tools, a custom system prompt and a JSON-schema output (`sidecar/prompt.ts`).
- `src-tauri/src/lib.rs` — starts the sidecar with `bun`, saves lessons as JSON in the app data folder, emits `lesson-event` to the UI.
- `src/` — React UI. Widgets live in `src/widgets/`: `BubbleSort` (built in) and `HtmlWidget` (Claude-written HTML in a sandboxed iframe, driven by `postMessage({ type: 'step', index, animate })`).

Keys in a lesson: → or Enter for the next step, ← for the previous one. Pressing next while a step is still animating finishes that animation first.
