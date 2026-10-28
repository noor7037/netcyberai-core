import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';

// Follows a page's imports (value imports only: `import type` never reaches the browser) and, from the first
// 'use client' file on, collects every client file the page sends (C402). For each it reads the message keys it names:
// a quoted key, or the fixed start of a key built at run time (`role.${role}`). And it names any client file that
// still imports the whole message table, through '@/lib/i18n' or LangContext's useT.

const ROOT = path.resolve(__dirname, '../..');
const IMPORT = /(?:import|export)\s(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g;
const TABLE = new Set(['src/lib/i18n/index.ts', 'src/components/app-shell/LangContext.tsx']);

function resolve(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = path.normalize(path.join(path.dirname(from), spec));
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) {
    const abs = path.join(ROOT, c);
    if (existsSync(abs) && statSync(abs).isFile()) return c;
  }
  return null;
}

const cache = new Map<string, { client: boolean; deps: string[]; src: string }>();
function read(file: string) {
  let hit = cache.get(file);
  if (!hit) {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    const client = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src);
    const deps = [...src.matchAll(IMPORT)].map((m) => resolve(m[1] ?? m[2], file)).filter((d): d is string => d !== null);
    hit = { client, deps, src };
    cache.set(file, hit);
  }
  return hit;
}

export type ClientWords = { files: string[]; tableUsers: string[]; quoted: Map<string, string>; built: Map<string, string> };

// Every client file under `page`, the client files that reach the table, and the keys they name (each with one file
// that names it, for the failure message).
export function clientWords(page: string, keys: Set<string>): ClientWords {
  const files = new Set<string>();
  const tableUsers = new Set<string>();
  const seen = new Set<string>();
  const stack: [string, boolean][] = [[page, false]];
  while (stack.length) {
    const [file, inherited] = stack.pop()!;
    const { client, deps } = read(file);
    const inClient = inherited || client;
    const key = `${file}|${inClient}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (inClient) files.add(file);
    for (const d of deps) {
      if (TABLE.has(d)) {
        if (inClient) tableUsers.add(file);
      } else stack.push([d, inClient]);
    }
  }
  const quoted = new Map<string, string>();
  const built = new Map<string, string>();
  for (const f of files) {
    const { src } = read(f);
    for (const m of src.matchAll(/['"]([a-z][A-Za-z0-9_]*\.[A-Za-z0-9_.]+)['"]/g)) if (keys.has(m[1]) && !quoted.has(m[1])) quoted.set(m[1], f);
    for (const m of src.matchAll(/`([a-z][A-Za-z0-9_]*\.[A-Za-z0-9_.]*\.)\$\{/g)) if (!built.has(m[1])) built.set(m[1], f);
  }
  return { files: [...files].sort(), tableUsers: [...tableUsers].sort(), quoted, built };
}
