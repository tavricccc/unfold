// Compiles sidecar/agent.ts into the target-triple binary Tauri expects under src-tauri/binaries/.
// Run: bun tools/build-agent.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TARGET_MAP: Record<string, string> = {
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'aarch64-apple-darwin': 'bun-darwin-arm64',
};

/** Returns the host Rust target triple reported by `rustc -vV`. */
function hostTriple(): string {
  const res = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`rustc -vV failed: ${res.stderr || 'unknown error'}`);
  }
  const match = /^host:\s*(\S+)/m.exec(res.stdout);
  if (!match) {
    throw new Error(`could not parse host triple from rustc -vV:\n${res.stdout}`);
  }
  return match[1];
}

const host = hostTriple();
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || process.env.CARGO_BUILD_TARGET || host;
const ext = triple.includes('windows') ? '.exe' : '';
const appRoot = join(import.meta.dir, '..');
const outfile = join(appRoot, 'src-tauri', 'binaries', `unfold-agent-${triple}${ext}`);

mkdirSync(dirname(outfile), { recursive: true });

const args = ['build', '--compile', '--minify'];
const bunTarget = triple === 'x86_64-pc-windows-msvc' || triple !== host ? TARGET_MAP[triple] : undefined;
if (triple !== host && !bunTarget) {
  throw new Error(`unsupported cross-compile target triple "${triple}" from host "${host}"`);
}
if (bunTarget) {
  args.push(`--target=${bunTarget}`);
}
args.push(join(appRoot, 'sidecar', 'agent.ts'), '--outfile', outfile);

const run = spawnSync(process.execPath, args, { stdio: 'inherit' });
if (run.error) throw run.error;
if (run.status !== 0) {
  process.exit(run.status ?? 1);
}
