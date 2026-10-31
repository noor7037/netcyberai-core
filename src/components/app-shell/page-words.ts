import type { Lang } from '@/lib/i18n';
import { pickWords } from '@/lib/i18n/pick';
import type { Words } from '@/lib/i18n/words';

// The words a page's client components show, picked on the server (C402): by key prefix, beside the shell's own
// (shell-words.ts). A page wraps its content in <WordsProvider words={pageWords(lang, route)}>; a route ending in
// `/*` is picked by that folder's layout, for every page under it. So no Control page carries the whole message table
// (scripts/check_family_budget.py holds every Control page under 250 kB), and a component the school app shares with
// Control reads the same picked words there. test/i18n/page-words.test.ts follows each page's client files and fails
// when one names a key nobody picks, or a Control page imports the table again. Server only: pickWords reads the table.
export const PAGE_WORDS = {
  '/control/account': ['account.devices.'],
  '/control/ai': ['control.ai.', 'control.video.'],
  '/control/ai/lab': ['control.ai.', 'fam.subject.'],
  '/control/apps': ['control.apps.'],
  '/control/audit-logs': ['control.audit.'],
  '/control/billing-plans': ['billing.', 'module.'],
  '/control/boards': ['boards.', 'fboards.', 'gs.'],
  '/control/content': ['control.content.', 'control.english.', 'control.import.', 'control.queue.', 'control.video.', 'fam.english.track.'],
  '/control/content/coverage': ['control.coverage.', 'fam.subject.'],
  '/control/content/hubs': ['fam.class.', 'fam.hub.', 'gs.', 'hubs.'],
  '/control/content/responses': ['control.content.', 'control.prepare.', 'control.queue.', 'fam.subject.'],
  // The studio shows a chapter as the Family reader does, so it picks the reader's words too.
  '/control/content/studio': [
    'ai.', 'control.studio.', 'fam.ai.', 'fam.block.', 'fam.check.', 'fam.class.', 'fam.ctest.', 'fam.dataSaver.', 'fam.err.', 'fam.followUp.',
    'fam.homework.', 'fam.label.', 'fam.model.', 'fam.offline.', 'fam.plan.', 'fam.reader.', 'fam.tutor.', 'fam.understand.', 'fam.video.',
    'fam.voice.', 'fam.voiceOut.', 'fam.chat.', 'fam.subject.',
  ],
  '/control/family': ['control.family.', 'fam.subject.'],
  '/control/family/people': ['control.apps.'],
  '/control/messaging-cost': ['cost.'],
  '/control/monitoring': ['monitoring.jobs.'],
  '/control/onboarding/applications/[applicationId]': ['onb.apps.'],
  '/control/onboarding/provision': ['control.provision.', 'control.invite.'],
  '/control/leads': ['control.leads.'],
  '/control/schools/[schoolId]': [
    'billing.form.', 'billing.source.', 'boards.err.', 'boards.school.', 'branding.', 'fee.', 'gs.bands.', 'gs.board.', 'gs.comp.', 'gs.types.',
    'login.', 'moduleOff.', 'modules.', 'onb.consent.', 'onb.flags.', 'onb.invite.', 'onb.pilot.', 'onb.stage.', 'rails.', 'set.', 'viewAs.', 'control.invite.', 'control.school.students.',
    'login.', 'moduleOff.', 'modules.', 'onb.consent.', 'onb.flags.', 'onb.invite.', 'onb.pilot.', 'onb.stage.', 'rails.', 'set.', 'viewAs.', 'control.invite.', 'control.school.staff.',
    'login.', 'moduleOff.', 'modules.', 'onb.consent.', 'onb.flags.', 'onb.invite.', 'onb.pilot.', 'onb.stage.', 'rails.', 'set.', 'viewAs.', 'control.invite.', 'control.school.attendance.',
    'login.', 'moduleOff.', 'modules.', 'onb.consent.', 'onb.flags.', 'onb.invite.', 'onb.pilot.', 'onb.stage.', 'rails.', 'set.', 'viewAs.', 'control.invite.', 'control.school.fees.', 'pay.method.',
  ],
  '/control/system-settings': ['control.sys.'],
  '/control/templates': ['tpl.'],
  '/control/users': ['sprof.', 'staff.reset.'],
  '/control/whatsapp': ['wa.'],
  // The school app's pages that show a component Control shares.
  '/app/exams/*': ['gs.'],
  '/app/learning-genome': ['gs.'],
  '/app/settings': ['branding.', 'fee.failed', 'rails.', 'set.off', 'set.on'],
  '/app/staff': ['sprof.open', 'staff.reset.'],
  '/design-system/shell/control': ['billing.form.', 'billing.source.', 'moduleOff.', 'modules.'],
} as const satisfies Record<string, readonly string[]>;

export type PageRoute = keyof typeof PAGE_WORDS;

export const pageWords = (lang: Lang, route: PageRoute): Words => pickWords(lang, [], PAGE_WORDS[route]);
