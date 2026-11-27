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

- `sidecar/agent.ts` — one question in on stdin, NDJSON events out (`status`, `session`, `partial`, `lesson` / `part`, `error`). Calls the Agent SDK with a custom system prompt, one JSON-schema output for every answer (`sidecar/prompt.ts`), and one tool, `read_chapter`, that lets Claude read a chapter as it is now (steps and the current visual after edits).
- A new lesson may start with questions: when the scope, the way to present it, or the learner's level would change the lesson, Claude answers with `ask` (1-4 questions with options). The lesson waits in `asking`; the learner picks options, types their own, or skips, and the answers resume the same session. 先問我 on the home page asks Claude to always ask first; otherwise it decides.
- A whole course: Claude answers a new lesson with `course`, an outline of 2-8 chapters, and the sidecar then writes the chapters one after another in that session. Each chapter lands as soon as it is written (the first as the lesson, the rest as course parts in `more`); a stopped or failed course resumes from its next chapter (`continue_course`).
- Every follow-up picks a mode: `chapter` (new chapter with its own visual), `extend` (more steps in the chapter being read, optionally redrawing the visual, for html usually through find/replace edits), or `text` (a reply in words only). The chapter titles are Claude's; the learner can rename them.
- Follow-ups resume the lesson's Claude Code session (`session` in the lesson file), so Claude keeps its own earlier answers in context and the prompt cache holds. The system prompt and the tool list never change between calls for the same reason. If the session cannot be resumed, the sidecar starts a new one from an outline of the lesson. Sessions live under the app data `sessions` folder.
- `src/chapters.ts` — how a lesson file reads as chapters, items and visual versions; shared by the UI and the sidecar.
- `src-tauri/src/lib.rs` — starts the sidecar, saves lessons as JSON in the app data folder (with each run's cost), emits `lesson-event` to the UI.
- `sidecar/partial.ts` — parses the half-written answer as it streams, so title and steps (or the reply text) reach the UI before the widget is finished.
- `src/` — React UI. Widgets live in `src/widgets/`:
  - `BubbleSort`, built in.
  - `Plot`, a Mafs coordinate plane described by Claude as params + items (function, area, riemann, tangent, point, vector, segment, polygon, text). Steps animate params; expressions go through the small parser in `expr.ts`, never `eval`.
  - `HtmlWidget`, Claude-written HTML in a sandboxed iframe, driven by `postMessage({ type: 'step', index, animate })`.
- Stop: the composer's stop button kills the sidecar process tree.

Keys in a lesson: → or Enter for the next step, ← for the previous one, PageDown / PageUp for the next or previous chapter. Pressing next while a step is still animating finishes that animation first. Double-click a chapter title (or its pencil) to rename it.
