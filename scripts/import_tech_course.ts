// Checks the Tech Lab lesson files (content/tech/lessons) the way the course loader does.
// It does not connect to a database and it does not apply the catalog seed.
// Applying the tables and the seed is a separate step, on a database that is not the live project.
//
//   npx tsx scripts/import_tech_course.ts

import fs from 'fs';
import path from 'path';
import { courseCatalog, lessonById, lessonCount } from '../src/lib/family/tech/catalog';
import { questionsOf } from '../src/lib/family/tech/score';

const LIVE = 'unodnyyfqhxrbusbkite';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const joined = process.argv.join(' ');
if (joined.includes(LIVE) || joined.includes('--apply')) {
  fail('This script only checks the lesson files. It does not apply the seed, and it will not touch the live database.');
}

const root = path.join(process.cwd(), 'content/tech');
const labs = new Set<string>();
for (const level of ['L1', 'L2', 'L3']) {
  for (const name of fs.readdirSync(path.join(root, 'labs', level))) if (name.endsWith('.html')) labs.add(name.replace(/\.html$/, ''));
}

let problems = 0;
const course = courseCatalog();
for (const unit of course.units) {
  for (const summary of unit.lessons) {
    const lesson = lessonById(summary.key);
    if (!lesson) {
      problems += 1;
      console.error(`missing ${summary.key}`);
      continue;
    }
    const body = JSON.stringify(lesson);
    if (body.length > 128 * 1024) {
      problems += 1;
      console.error(`too big ${lesson.id}`);
    }
    if (!lesson.title || typeof lesson.title === 'string' || !lesson.title.en || !lesson.title.hi || !lesson.title.hinglish) {
      problems += 1;
      console.error(`title languages ${lesson.id}`);
    }
    for (const question of questionsOf(lesson)) {
      if (question.answer == null || question.explain == null) {
        problems += 1;
        console.error(`question ${lesson.id} ${question.id}`);
      }
    }
    const lab = lesson.play?.lab;
    if (lab && lab !== 'scene' && !labs.has(lab)) {
      problems += 1;
      console.error(`no lab file ${lesson.id} ${lab}`);
    }
  }
}

if (lessonCount() !== 281 || course.units.length !== 50) fail(`expected 281 lessons and 50 units, found ${lessonCount()} and ${course.units.length}`);
if (problems) fail(`${problems} problem(s)`);
console.log(`Tech Lab files OK: ${lessonCount()} lessons, ${course.units.length} units, ${labs.size} lab pages.`);
console.log('The tables are applied (migration 20261127224657). The catalog seed (supabase/seeds/seed_tl1_tech_catalog.sql) is optional: the app reads the lesson files.');
