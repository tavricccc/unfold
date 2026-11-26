# Product film

A one-minute intro to Unfold, rendered from code. The app in it is the real app (the same React
components and CSS): only its backend is swapped for `src/promo-api.ts`, which replays recorded
lessons from `data/lessons.json` with the same events the sidecar sends. Clicks, typing and the
slider drag are real input, sent through the DevTools protocol, so the app reacts as it would to a
person.

## Render

```sh
node showcase/video/prep.mjs          # optional: refresh data/lessons.json from the app's lesson folder
cd showcase/video
node node_modules/vite/bin/vite.js build     # → R:/unfold-video/dist (FILM_OUT to change)
node capture.mjs --dsf 2 --out R:/unfold-video/film-v.mp4   # 1080p, plus -4k.mp4 from the 2x frames
node audio.mjs R:/unfold-video/cues.json R:/unfold-video/music.wav
ffmpeg -i R:/unfold-video/film-v.mp4 -i R:/unfold-video/music.wav -c:v copy -c:a aac -b:a 256k -shortest out/unfold.mp4
```

`node_modules` here is a junction to `app/node_modules` (`mklink /J showcase\video\node_modules app\node_modules`).

Previews: `node capture.mjs --dsf 1 --stills <dir> --every 30` writes one frame every half second;
`--from` / `--to` limit the range.

## How it works

- `cdp.mjs` — a small DevTools client. It runs `chrome-headless-shell` (from the Playwright cache)
  with BeginFrame control and virtual time, so every frame is computed exactly, never recorded in
  real time: a slow frame cannot drop or stutter. Virtual time moves in whole milliseconds, so
  frames step 17, 17, 16 ms.
- `src/engine.ts` — the timeline. Every animated value is a function of `t`; `at(t, f)` runs an
  action once.
- `src/film-main.ts` — the film: scenes, camera moves on the app window, the cursor, captions.
  Each click or keystroke calls `input()`, which `capture.mjs` turns into a real mouse or key event
  before the next frame.
- `audio.mjs` — the soundtrack, synthesised: a 120 BPM bed shaped to the sections, and effects on
  the cues the film writes while it is captured (`cues.json`).
