// The teacher's online-test screens for the screenshot harness (AQ-4, C365): a paper sat online on its marking hub
// (the test's times, opened, the class's attempts in roll order with the times each child left the test screen; no
// score), in English and Hindi, and an online script in the review with its typed answers in place of page pictures.
// Each is seeded with scripts/harness/online-seed.mjs, checked with axe, and put back, so the screens that follow see
// the same school. Illustrative only. Loaded only by run.mjs, into a throwaway local database.
//
//   onlineScreens(ctx)   [who, name, route, prepare(page), after(page)] as run.mjs's list wants them
import { createRequire } from 'node:module';
import { clearOnline, ON, seedOnline } from './online-seed.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

export function onlineScreens({ db, SCHOOL, PEOPLE, speak, backToEnglish }) {
  const hub = `/app/exams/papers/${ON.paper}/marking`;
  const script = `${hub}/${ON.sheet}`;
  let axeFound = [];
  let before;

  const axe = async (page, name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addScriptTag({ path: AXE });
    const found = await page.evaluate(async () => {
      const r = await window.axe.run(document.querySelector('[data-module-page]') ?? document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    for (const f of found) axeFound.push(`${name}: ${f}`);
  };
  const prepare = (name, { hindi = false, settle }) => async (page) => {
    before = (await db.pg.query(`select enabled, source, limits from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL])).rows[0] ?? null;
    await seedOnline(db, { school: SCHOOL, principal: PEOPLE.principal.sub, teacher: PEOPLE.teacher.sub });
    await page.reload({ waitUntil: 'networkidle' });
    if (hindi) await speak('हिन्दी')(page);
    await page.locator(settle).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    await axe(page, name);
  };
  const putBack = ({ hindi = false } = {}) => async (page) => {
    try {
      if (hindi) await backToEnglish(page);
    } finally {
      await page.goto('about:blank').catch(() => undefined);
      await clearOnline(db, SCHOOL);
      if (before === null) await db.pg.query(`delete from school_module_entitlements where school_id = $1 and module_id = 'exams'`, [SCHOOL]);
      else if (before) await db.pg.query(`update school_module_entitlements set enabled = $2, source = $3, limits = $4::jsonb where school_id = $1 and module_id = 'exams'`, [SCHOOL, before.enabled, before.source, JSON.stringify(before.limits ?? {})]);
      before = undefined;
    }
    const found = axeFound;
    axeFound = [];
    if (found.length) throw new Error(`axe found ${found.join('; ')}`);
  };

  return [
    ['teacher', 'aq4-online-hub', hub, prepare('aq4-online-hub', { settle: '[data-online-attempts]' }), putBack()],
    ['teacher', 'aq4-online-hub-hindi', hub, prepare('aq4-online-hub-hindi', { hindi: true, settle: '[data-online-attempts]' }), putBack({ hindi: true })],
    ['teacher', 'aq4-online-script', script, prepare('aq4-online-script', { settle: '[data-online-answers]' }), putBack()],
  ];
}
