import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// W2-15: /app/account (every role; the founder met it as a teacher) and /control/account failed with "Application
// error". Both pages imported DEVICE_WORD_KEYS, a list, from SecurityPanel, a 'use client' file, and called .map on it
// while rendering on the server. On the server everything a 'use client' file exports is only a reference, to be
// rendered as a component or handed to one; calling or reading it throws ("Attempted to call map() from the server
// but map is on the client"). A unit test does not see this (vitest ignores the directive), so this test walks the
// server side of the app the way Next.js does: every page, layout and route handler, then each file they import that
// is not 'use client', and so on. From a 'use client' file such code may take components only (PascalCase names),
// or types.

const SRC = path.resolve(__dirname, '../../src');
const ENTRY = /^(page|layout|template|not-found|loading|default|route|opengraph-image|icon|apple-icon|sitemap|robots|manifest)\.(ts|tsx)$/;
const COMPONENT = /^[A-Z](?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]*$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (ENTRY.test(name)) out.push(p);
  }
  return out;
}

// True when the file's first statement is the 'use client' directive (comments may come before it).
function isClient(source: string): boolean {
  const rest = source.replace(/^(?:\s+|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
  return /^['"]use client['"]/.test(rest);
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null; // a package
  for (const p of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (/\.(ts|tsx)$/.test(p) && existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

type Name = { from: string; as: string };
type Import = { spec: string; reexport: boolean; names: Name[]; namespace: boolean };

const valueNames = (inside: string): Name[] =>
  inside
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('type '))
    .map((s) => {
      const [from, as] = s.split(/\s+as\s+/);
      return { from, as: as ?? from };
    });

// The static imports and re-exports of a file, with the names it takes as values (type-only names left out). Only
// statements at the start of a line are read: this repository's imports all are, and text inside strings is not.
function importsOf(source: string): Import[] {
  const out: Import[] = [];
  for (const m of source.matchAll(/^import\s+(type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    if (m[1]) continue;
    const braces = m[2].match(/\{([^}]*)\}/);
    out.push({ spec: m[3], reexport: false, names: braces ? valueNames(braces[1]) : [], namespace: /\*\s+as\s+\w+/.test(m[2]) });
  }
  for (const m of source.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) out.push({ spec: m[1], reexport: false, names: [], namespace: false });
  for (const m of source.matchAll(/^export\s+(type\s+)?(\{[^}]*\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    if (m[1]) continue;
    const alias = m[2].match(/^\*\s+as\s+(\w+)/)?.[1];
    if (m[2].startsWith('{')) out.push({ spec: m[3], reexport: true, names: valueNames(m[2].slice(1, -1)), namespace: false });
    else out.push({ spec: m[3], reexport: true, names: alias ? [{ from: '*', as: alias }] : [], namespace: !alias });
  }
  return out;
}

// Every use, from server code, of a name a 'use client' file exports that is not a component: imported straight from
// that file, or through a server file that re-exports it. A barrel (components/app-ui/index.ts) may re-export a
// client hook; that is harmless until server code imports the hook from there.
function boundaryBreaks(entries: string[]): string[] {
  const clientCache = new Map<string, boolean>();
  const client = (file: string) => {
    if (!clientCache.has(file)) clientCache.set(file, isClient(readFileSync(file, 'utf8')));
    return clientCache.get(file)!;
  };
  // The server side: the entries that are not 'use client', and every file they import that is not either.
  const graph = new Map<string, { target: string; imp: Import }[]>();
  const queue = entries.filter((f) => !client(f));
  while (queue.length) {
    const file = queue.pop()!;
    if (graph.has(file)) continue;
    const edges = importsOf(readFileSync(file, 'utf8')).flatMap((imp) => {
      const target = resolve(file, imp.spec);
      return target ? [{ target, imp }] : [];
    });
    graph.set(file, edges);
    for (const e of edges) if (!client(e.target)) queue.push(e.target);
  }
  // The names each server file hands on from a client file, to a fixed point (a barrel of barrels); '*' for all.
  const handsOn = new Map<string, Set<string>>([...graph.keys()].map((f) => [f, new Set<string>()]));
  const tainted = (target: string) => client(target) || (handsOn.get(target)?.size ?? 0) > 0;
  const offending = (target: string, name: string) => (client(target) ? !COMPONENT.test(name) : !!handsOn.get(target)?.has(name) || !!handsOn.get(target)?.has('*'));
  for (let changed = true; changed; ) {
    changed = false;
    for (const [file, edges] of graph) {
      const mine = handsOn.get(file)!;
      for (const { target, imp } of edges) {
        if (!imp.reexport) continue;
        const add = imp.namespace ? (tainted(target) ? ['*'] : []) : imp.names.filter((n) => (n.from === '*' ? tainted(target) : offending(target, n.from))).map((n) => n.as);
        for (const n of add) {
          if (mine.has(n)) continue;
          mine.add(n);
          changed = true;
        }
      }
    }
  }
  const breaks: string[] = [];
  for (const [file, edges] of graph) {
    for (const { target, imp } of edges) {
      if (imp.reexport) continue;
      const where = `${path.relative(SRC, file)} imports from ${path.relative(SRC, target)}`;
      if (imp.namespace && tainted(target)) breaks.push(`${where}: * (a namespace)`);
      for (const n of imp.names) if (offending(target, n.from)) breaks.push(`${where}: ${n.from}`);
    }
  }
  return breaks.sort();
}

describe("server code takes only components from 'use client' files", () => {
  it('finds the server side of the app', () => {
    const entries = walk(path.join(SRC, 'app'));
    expect(entries.some((f) => f.endsWith(path.join('(school)', 'app', 'account', 'page.tsx')))).toBe(true);
    expect(entries.some((f) => f.endsWith(path.join('control', 'account', 'page.tsx')))).toBe(true);
  });

  it('reads the parts it needs: the directive, value names, components', () => {
    expect(isClient("'use client';\nexport const KEYS = ['a'] as const;\n")).toBe(true);
    expect(isClient("// a note\n/* and more */\n'use client';\n")).toBe(true);
    expect(isClient("import { KEYS } from './panel';\n")).toBe(false);
    expect(importsOf("import { KEYS, Panel as P, type Thing } from './panel';\nimport type { Other } from './panel';\nexport { useX, type Y } from './hooks';\n")).toEqual([
      { spec: './panel', reexport: false, names: [{ from: 'KEYS', as: 'KEYS' }, { from: 'Panel', as: 'P' }], namespace: false },
      { spec: './hooks', reexport: true, names: [{ from: 'useX', as: 'useX' }], namespace: false },
    ]);
    expect(['KEYS', 'Panel', 'useT', 'MyQualificationsPanel', 'UI_WORDS'].filter((n) => !COMPONENT.test(n))).toEqual(['KEYS', 'useT', 'UI_WORDS']);
  });

  it('no page, layout or route handler (or a server file they import) takes anything else', () => {
    const entries = [...walk(path.join(SRC, 'app')), ...['middleware.ts', 'instrumentation.ts'].map((f) => path.join(SRC, f)).filter((f) => existsSync(f))];
    expect(boundaryBreaks(entries)).toEqual([]);
  });
});
