// A lesson's reference folders: what Claude may read in them, and how a file is named to the learner.
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';

/** What Claude may use on a lesson's reference folders: reading only. */
export const REF_TOOLS = ['Read', 'Glob', 'Grep'];

export const inside = (p: string, root: string) => { const r = relative(root, p); return r === '' || (r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };

/**
 * Where a file tool call looks, or why it may not: every call must stay inside the reference
 * folders, and Glob and Grep must say where they search.
 */
export function refTarget(name: string, input: Record<string, unknown>, refs: string[]): { path: string } | { deny: string } {
  const raw = name === 'Read' ? input.file_path : input.path;
  if (typeof raw !== 'string' || !raw.trim()) return { deny: `${name} needs an absolute "${name === 'Read' ? 'file_path' : 'path'}" inside the reference folders: ${refs.join(', ')}` };
  const p = resolve(raw);
  if (!refs.some((r) => inside(p, r))) return { deny: `${raw} is outside the reference folders; only these may be read: ${refs.join(', ')}` };
  // Glob's pattern and Grep's file filter are paths below "path"; Grep's own pattern is a regex
  for (const k of name === 'Glob' ? ['pattern'] : name === 'Grep' ? ['glob'] : []) {
    const g = input[k];
    if (typeof g === 'string' && (isAbsolute(g) || /(^|[\\/])\.\.([\\/]|$)/.test(g))) {
      return { deny: `the ${name} "${k}" must be relative and stay inside "path" (no absolute paths, no ..)` };
    }
  }
  return { path: p };
}

/** A file as the learner knows it: relative to its folder, under the folder's name when there are several. */
export function shortPath(p: string, refs: string[]) {
  const root = refs.find((r) => inside(p, r));
  if (!root) return basename(p);
  const rel = relative(root, p).replace(/\\/g, '/');
  return refs.length > 1 ? `${basename(root)}/${rel}` : rel || basename(root);
}
