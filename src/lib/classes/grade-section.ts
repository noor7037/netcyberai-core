/** Best-effort split of a class `name` on its last hyphen ("8-A" -> grade
 * "8", section "A"); a name with no hyphen leaves section null rather than
 * guessing. Extracted from the classes route (Decision Log C69) so it can
 * be unit-tested without a database. */
export function deriveGradeSection(name: string): { grade: string; section: string | null } {
  const lastHyphen = name.lastIndexOf('-');
  const grade = lastHyphen > 0 ? name.slice(0, lastHyphen).trim() : name;
  const section = lastHyphen > 0 ? name.slice(lastHyphen + 1).trim() : null;
  return { grade, section };
}
