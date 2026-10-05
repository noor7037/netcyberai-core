import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchoolEntitlementsPanel, type EntitlementsApi, type EntitlementsData } from '@/components/control/SchoolEntitlementsPanel';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';

const api: EntitlementsApi = { load: async () => data, change: async () => undefined };
const data: EntitlementsData = {
  entitlements: {
    schoolId: 's',
    plan: 'standard',
    accessMode: 'read_only',
    graceEndsAt: '2020-01-31T18:29:59.000Z', // a grace period that has ended
    modules: { students: { enabled: true, source: 'plan' }, fees: { enabled: false, source: 'founder_override' } },
  },
  plans: [{ planId: 'standard', label: 'Standard', moduleIds: ['students', 'attendance'] }],
  history: [{ id: '1', at: '2026-10-01T10:00:00Z', actorName: 'Noor', kind: 'module_changed', moduleId: 'fees', enabled: { from: true, to: false }, reason: 'pilot ended' }],
};
const render = (d: EntitlementsData = data) => renderToStaticMarkup(h(SchoolEntitlementsPanel, { api, initial: d }));

describe('Control: modules and access', () => {
  it('shows the plan, the access mode, and that the grace period ended', () => {
    const html = render();
    expect(html).toContain('Plan: standard');
    expect(html).toContain('Read only');
    expect(html).toContain('Grace ended');
    expect(html).toContain('Apply a plan');
    expect(html).toContain('Reason (only you can read it; the school never sees it)');
  });

  it('lists every module with a switch, except Help, which is always on', () => {
    const html = render();
    for (const m of MODULE_REGISTRY) expect(html).toContain(m.label.replace(/&/g, '&amp;'));
    expect(html).toContain('aria-label="Switch off Students"');
    expect(html).toContain('aria-label="Switch on Fees"');
    expect(html).toContain('Set by hand');
    expect(html).toContain('Always on for every school');
    expect(html).not.toContain('aria-label="Switch off Help Center"');
    expect(html).not.toContain('aria-label="Switch off Raise Ticket"');
    // Help counts as on even with no row: students + the two help modules.
    expect(html).toContain(`3 of ${MODULE_REGISTRY.length} modules are on`);
  });

  it('a failed switch says so inside the dialog, not behind it (code-review finding)', () => {
    const html = renderToStaticMarkup(h(SchoolEntitlementsPanel, { api, initial: data, initialDialog: { moduleId: 'fees', error: 'The change was not saved.' } }));
    const dialog = html.slice(html.indexOf('<dialog'));
    expect(dialog).toContain('Switch on Fees?');
    expect(dialog).toContain('role="alert"');
    expect(dialog).toContain('The change was not saved.');
    expect(html.slice(0, html.indexOf('<dialog'))).not.toContain('role="alert"'); // not also behind it
  });

  it('shows who changed what and why, or says there is no history yet', () => {
    const html = render();
    expect(html).toContain('Fees switched off');
    expect(html).toContain('Noor');
    expect(html).toContain('pilot ended');
    expect(render({ ...data, history: [] })).toContain('No changes yet');
  });
});
