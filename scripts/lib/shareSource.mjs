// shareSource — the share page (app/share/[id]/) as ONE module, for guards (2026-11-25, owner: "Is there a way to reduce
// the size of the share page file?" → "Yes"). The page was split into one file per tab with no line of code changed;
// guards that read, regex, mutate or transpile "the page" read this instead: the files joined in a fixed order, their
// imports from outside the folder merged, their imports from each other and their `export { … }` lines dropped.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SHARE_DIR = 'app/share/[id]';
/** Every file of the page, in the order they are joined. A new file must be added here (verify-share-split checks). */
export const SHARE_FILES = ['shared', 'ui', 'RepairStatus', 'HomeTab', 'EthixTab', 'FindingsTab', 'MaintainTab', 'ReportTab', 'SystemsTab',
  'RecordsTab', 'LedrixPanel', 'LedrixChat', 'RepairsTab', 'page'].map(f => `${f}.tsx`);

/** Join `files` ({name: text}) into one module. */
export function joinShare(files) {
  const mods = new Map();   // module → { dflt, items: Map(local → text) }
  const bodies = [];
  for (const name of SHARE_FILES) {
    const src = files[name];
    if (typeof src !== 'string') throw new Error(`shareSource: missing ${name}`);
    const keep = [];
    for (const line of src.split('\n')) {
      if (line === "'use client';") continue;
      const m = line.match(/^import (?:(\w+)(?:, )?)?(?:\{([^}]*)\})? from '([^']+)';$/);
      if (m) {
        if (m[3].startsWith('./')) continue;                 // one of the page's own files
        const e = mods.get(m[3]) ?? { dflt: null, items: new Map() };
        if (m[1]) e.dflt = m[1];
        for (const part of (m[2] ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
          const local = part.replace(/^type /, '').split(' as ').pop().trim();
          const prev = e.items.get(local);
          if (!prev || prev.startsWith('type ')) e.items.set(local, part);   // a value import wins over a type one
        }
        mods.set(m[3], e);
        continue;
      }
      if (/^export (type )?\{ [^}]* \};$/.test(line)) continue;
      keep.push(line);
    }
    while (keep.length && keep[0].trim() === '') keep.shift();
    bodies.push(keep.join('\n').replace(/\s+$/, ''));
  }
  const imports = [...mods].map(([mod, e]) => {
    const named = [...e.items.values()];
    return `import ${e.dflt ?? ''}${e.dflt && named.length ? ', ' : ''}${named.length ? `{ ${named.join(', ')} }` : ''} from '${mod}';`;
  });
  return `'use client';\n\n${imports.join('\n')}\n\n${bodies.join('\n\n')}\n`;
}

/** The page as one module, read from `repo`. */
export function shareSource(repo) {
  const files = {};
  for (const f of SHARE_FILES) files[f] = readFileSync(join(repo, SHARE_DIR, f), 'utf8');
  return joinShare(files);
}
