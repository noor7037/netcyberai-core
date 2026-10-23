import { describe, expect, it } from 'vitest';
import type { AppFlag } from '@/lib/contracts/app-flags';
import { switchOn, type FamilySwitches } from '@/lib/family/flags';

// C230-Z (the founder's instruction of 2026-10-23): a built module with no saved switch is on; Control's saved switch
// decides once there is one, and the whole app's switch always applies.
const flag = (module: string, over: Partial<AppFlag> = {}): AppFlag => ({ app: 'family', module, enabled: true, audience: 'everyone', audiencePercent: null, audienceSchools: null, endsAt: null, offMessageEn: null, offMessageHi: null, ...over }) as AppFlag;
const switches = (flags: AppFlag[]): FamilySwitches => ({ flags, banners: [], isPreview: false, accountId: null, minShell: 0 });

describe('a built Family module is on unless Control says otherwise', () => {
  it('on with no saved switch, while the whole app is on', () => {
    expect(switchOn(switches([flag('*')]), 'plan')).toBe(true);
    expect(switchOn(switches([flag('*')]), 'english_programme')).toBe(true);
  });
  it('Control switching it off, or limiting it to staff preview, still decides', () => {
    expect(switchOn(switches([flag('*'), flag('plan', { enabled: false })]), 'plan')).toBe(false);
    expect(switchOn(switches([flag('*'), flag('plan', { audience: 'staff_preview' })]), 'plan')).toBe(false);
  });
  it('the whole app off turns every module off, and a module not built yet stays off', () => {
    expect(switchOn(switches([flag('*', { enabled: false })]), 'plan')).toBe(false);
    expect(switchOn(switches([flag('*')]), 'not_a_module')).toBe(false);
  });
});
