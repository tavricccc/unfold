# Unfold

A personal interactive tutor. Ask a question; your local Claude Code (through the Agent SDK) writes a lesson script, and the app plays it step by step on an interactive widget.

## Run

```sh
bun install
bun run tauri dev
```

Needs Claude Code installed and signed in (`claude --version`), plus Rust and Bun.
Set `CARGO_TARGET_DIR` to keep Rust build output elsewhere (e.g. a RAM disk).

### Installer

```sh
bun run tauri build
```

Produces `Unfold_<version>_x64-setup.exe` (NSIS, per-user install, no admin) under `<target>/release/bundle/nsis/`.
The build first compiles the sidecar into `src-tauri/binaries/unfold-agent-*.exe` with `bun build --compile`; the app runs it from its install folder and points it at the user's own `claude` executable.

Fonts are bundled in `src/fonts`; `bun tools/fetch-fonts.ts` rebuilds them (Instrument Sans, DM Mono, and GenYo Gothic TW cut into unicode-range slices; needs Python with fonttools and brotli).

`bun run check` runs the expression and streaming-parser checks.

`bun run dev` alone opens the UI in a browser with recorded sample lessons and a fake generator, for layout work without Claude.

## How it fits

- `sidecar/agent.ts` — one question in on stdin, NDJSON events out (`status`, `lesson`, `error`). Calls the Agent SDK with no tools, a custom system prompt and a JSON-schema output (`sidecar/prompt.ts`).
- `src-tauri/src/lib.rs` — starts the sidecar with `bun`, saves lessons as JSON in the app data folder, emits `lesson-event` to the UI.
- `sidecar/partial.ts` — parses the half-written lesson JSON as it streams, so title and steps reach the UI before the widget is finished (the schema puts `widget` last).
- `src/` — React UI. Widgets live in `src/widgets/`:
  - `BubbleSort`, built in.
  - `Plot`, a Mafs coordinate plane described by Claude as params + items (function, area, riemann, tangent, point, vector, segment, polygon, text). Steps animate params; expressions go through the small parser in `expr.ts`, never `eval`.
  - `HtmlWidget`, Claude-written HTML in a sandboxed iframe, driven by `postMessage({ type: 'step', index, animate })`.
- Stop: the composer's stop button kills the sidecar process tree.

Keys in a lesson: → or Enter for the next step, ← for the previous one. Pressing next while a step is still animating finishes that animation first.
