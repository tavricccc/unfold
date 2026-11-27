import { refTarget, shortPath } from '../sidecar/refs.ts';

let bad = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    bad++;
    console.log('FAIL:', msg);
  }
};
const win = process.platform === 'win32';
const root = win ? 'C:\\work\\proj' : '/work/proj';
const docs = win ? 'D:\\notes' : '/notes';
const j = (...p: string[]) => p.join(win ? '\\' : '/');
const ok = (name: string, input: Record<string, unknown>, refs = [root]) => 'path' in refTarget(name, input, refs);

assert(ok('Read', { file_path: j(root, 'src', 'main.ts') }), 'a file inside the folder can be read');
assert(!ok('Read', { file_path: j(root, '..', 'secret.txt') }), 'a path that climbs out is refused');
assert(!ok('Read', { file_path: win ? 'C:\\Users\\me\\.ssh\\id_rsa' : '/home/me/.ssh/id_rsa' }), 'a path outside is refused');
assert(!ok('Read', { file_path: 'src/main.ts' }), 'a relative path resolves outside and is refused');
assert(!ok('Read', {}), 'Read without a path is refused');
assert(!ok('Read', { file_path: j(root + '-other', 'x.ts') }), 'a sibling folder sharing the prefix is refused');
if (win) assert(ok('Read', { file_path: 'c:\\WORK\\proj\\README.md' }), 'Windows paths compare without case');
assert(ok('Read', { file_path: j(root, '..hidden', 'x') }), 'a name starting with two dots is still inside');
assert(ok('Glob', { pattern: '**/*.ts', path: root }), 'Glob inside the folder is allowed');
assert(!ok('Glob', { pattern: '**/*.ts' }), 'Glob without path is refused');
assert(!ok('Glob', { pattern: '../**/*', path: root }), 'Glob climbing out with .. is refused');
assert(!ok('Glob', { pattern: win ? 'C:/Users/**' : '/home/**', path: root }), 'an absolute Glob pattern is refused');
assert(ok('Grep', { pattern: '\\.\\./|^/api', path: j(root, 'src') }), 'Grep regex patterns are not paths');
assert(!ok('Grep', { pattern: 'x', path: root, glob: '../*.env' }), 'a Grep file filter climbing out is refused');
assert(ok('Read', { file_path: j(docs, 'a.pdf') }, [root, docs]), 'any of several folders can be read');

assert(shortPath(j(root, 'src', 'main.ts'), [root]) === 'src/main.ts', 'one folder: path relative to it');
assert(shortPath(j(docs, 'a.pdf'), [root, docs]) === 'notes/a.pdf', 'several folders: under the folder name');

console.log(bad ? `${bad} failed` : 'refs checks ok');
if (bad) process.exit(1);
