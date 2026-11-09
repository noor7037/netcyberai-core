// Which files of the chapter reader (reader/) and its labs (labs/) the Family app serves under /family/learn/, and as
// what type (src/app/(family)/family/(app)/learn/[...path]/route.ts). Only what a child's page needs: the pages, their
// scripts and styles, the chapter and lab data, and the images; never the checker scripts, contracts or smoke page.

export const LEARN_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
// Each allowed file, as a path pattern from the repository root.
const ALLOWED: readonly RegExp[] = [
  /^reader\/(index\.html|reader\.js|reader\.css)$/,
  /^reader\/content\/[a-z0-9_./-]+\.json$/,
  /^labs\/(index\.html|engine\.js|lib\.js|styles\.css|index\.json|catalogue\.json)$/,
  /^labs\/templates\/[a-z0-9_-]+\.js$/,
  /^labs\/defs\/[a-z0-9_./-]+\.json$/,
  /^labs\/assets\/[A-Za-z0-9_./-]+\.(webp|png|jpg|svg|json)$/,
];
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export function allowedLearnFile(parts: readonly string[]): string | null {
  if (!parts.length || parts.some((p) => !SEGMENT.test(p) || p.includes('..'))) return null;
  const rel = parts.join('/');
  return ALLOWED.some((re) => re.test(rel)) ? rel : null;
}

