// Checks some Tech Lab units' lesson files (read only): file problems and the teaching-standard gaps, per lesson.
//   npx tsx scripts/tech_check_units.ts L2.networking L2.web
import { courseCatalog, lessonById, resetCatalogCache } from '../src/lib/family/tech/catalog';
import { auditLesson, lessonProblems } from '../src/lib/family/tech/validate';

resetCatalogCache();
const want = new Set(process.argv.slice(2));
let bad = 0;
for (const unit of courseCatalog().units) {
  if (want.size && !want.has(unit.id)) continue;
  for (const row of unit.lessons) {
    const lesson = lessonById(row.key);
    if (!lesson) continue;
    const problems = lessonProblems(lesson);
    bad += problems.length;
    const a = auditLesson(lesson);
    console.log(`${a.id}  ${a.grade}  pictures ${a.drawn}/${a.pictures}  ${a.gaps.join('; ') || 'no gaps'}`);
    for (const p of problems) console.log(`  PROBLEM ${p}`);
  }
}
if (bad) process.exit(1);
