import { describe, expect, it } from 'vitest';
import { FAMILY_MODULES } from '@/lib/contracts/family-modules';
import { familyModuleRows, type FlagRow } from '@/lib/control/apps';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// C230-V: Control → Apps listed only modules that already had a saved row, so every module shipped after the first rows
// (the English course, the plan, the habit, worksheets, videos, homework, voice, offline packs) could never be switched
// on. It now lists the registry's built modules, saved or not.

const row = (module: string, over: Partial<FlagRow> = {}): FlagRow => ({ app: 'family', module, enabled: true, audience: 'everyone', audience_percent: null, audience_schools: null, reason: null, ends_at: null, off_message_en: null, off_message_hi: null, updated_at: '2026-10-22T00:00:00.000Z', ...over });
const built = FAMILY_MODULES.filter((m) => m.built).map((m) => m.flag);

describe('the Family modules Control → Apps lists', () => {
  it('every built module, in the registry’s order, saved or not; the whole-app switch is not a module', () => {
    const list = familyModuleRows([row('*'), row('understand'), row('practice', { enabled: false })]);
    expect(list.map((r) => r.flag.module)).toEqual(built);
    expect(list.find((r) => r.flag.module === 'understand')).toEqual({ flag: row('understand'), everSet: true });
    expect(list.find((r) => r.flag.module === 'practice')?.flag.enabled).toBe(false);
  });

  it('a module never saved is listed on, for everyone (C230-Z: on by default), ready to be switched off', () => {
    const english = familyModuleRows([]).find((r) => r.flag.module === 'english_programme');
    expect(english).toEqual({ everSet: false, flag: expect.objectContaining({ app: 'family', module: 'english_programme', enabled: true, audience: 'everyone' }) });
    for (const m of ['plan', 'habit', 'worksheets', 'videos', 'homework', 'voice_input', 'offline']) expect(familyModuleRows([]).some((r) => r.flag.module === m), m).toBe(true);
  });

  it('the Focus Lock, never saved, is listed off (C304: only for the closed pilot families), ready to be switched on', () => {
    expect(familyModuleRows([]).find((r) => r.flag.module === 'focus_lock')).toEqual({ everSet: false, flag: expect.objectContaining({ module: 'focus_lock', enabled: false }) });
    expect(familyModuleRows([row('focus_lock')]).find((r) => r.flag.module === 'focus_lock')).toEqual({ flag: row('focus_lock'), everSet: true });
  });

  it('a saved row the registry no longer lists stays at the end, so it can still be switched off; modules not built are not listed', () => {
    const list = familyModuleRows([row('retired_thing')]);
    expect(list.at(-1)).toEqual({ flag: row('retired_thing'), everSet: true });
    for (const m of FAMILY_MODULES.filter((x) => !x.built)) expect(list.some((r) => r.flag.module === m.flag), m.flag).toBe(false);
  });

  it('only the Family app’s rows are read', () => {
    expect(familyModuleRows([row('understand', { app: 'school' as never })]).find((r) => r.flag.module === 'understand')?.everSet).toBe(false);
  });

  it('every built module has a name in words, in English and Hindi, so a new one cannot ship as a bare id', () => {
    for (const m of built) {
      const key = `control.apps.module.label.${m}`;
      expect(en[key as keyof typeof en], `en ${key}`).toBeTruthy();
      expect(hi[key as keyof typeof hi], `hi ${key}`).toBeTruthy();
    }
  });
});
