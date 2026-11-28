// Compiles sidecar/agent.ts to the file name Tauri's externalBin expects on this host.
// Run: bun tools/build-agent.ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const triple = Bun.spawnSync(['rustc', '--print', 'host-tuple']).stdout.toString().trim();
if (!triple) throw new Error('rustc --print host-tuple printed nothing');
const app = join(import.meta.dir, '..');
const bins = join(app, 'src-tauri', 'binaries');
mkdirSync(bins, { recursive: true });
const out = join(bins, `unfold-agent-${triple}${triple.includes('windows') ? '.exe' : ''}`);
const r = Bun.spawnSync([process.execPath, 'build', '--compile', '--minify', join(app, 'sidecar', 'agent.ts'), '--outfile', out], { stdio: ['inherit', 'inherit', 'inherit'] });
process.exit(r.exitCode);
