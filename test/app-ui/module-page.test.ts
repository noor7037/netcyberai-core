import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'child_process';
import path from 'path';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { HERO_TONES } from '@/components/app-ui/tones';

// ModulePage (docs/19 rule 1, C132): one layout for every working screen,
// with its slots always in the same order, and a CI check that every /app
// and /control page uses it.

const slots = (html: string) => [...html.matchAll(/data-slot="(\w+)"|<(h1)|role="(note)"|data-bulk="(1)"/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? 'bulk');

describe('ModulePage', () => {
  it('lays the slots out in one fixed order: header, primary, more, notice, search, filters, body, bulk', () => {
    const html = renderToStaticMarkup(
      h(ModulePage, {
        title: 'Students',
        purpose: 'All students at this school.',
        // Given out of order on purpose: the order on screen never changes.
        bulk: h('div', { 'data-bulk': '1' }, 'bulk'),
        filters: h('span', null, 'chips'),
        search: h('input', { type: 'search' }),
        notice: h('p', { role: 'note' }, 'notice'),
        more: h('button', null, 'Import'),
        primary: h('button', null, 'Add'),
        children: h('ul', null, 'list'),
      })
    );
    expect(slots(html)).toEqual(['h1', 'primary', 'more', 'note', 'search', 'filters', 'body', 'bulk']);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain('All students at this school.');
  });

  it('leaves out a slot the screen does not use', () => {
    const html = renderToStaticMarkup(h(ModulePage, { title: 'Settings', purpose: 'p', children: 'x' }));
    expect(slots(html)).toEqual(['h1', 'body']);
    expect(html).toContain('data-module-page="page"');
  });

  it('takes the icon, colour and group name from the registry when given a module: the banner is a gradient in the group’s tone', () => {
    const fees = renderToStaticMarkup(h(ModulePage, { moduleId: 'fees', title: 'Fees', purpose: 'p', children: 'x' }));
    expect(fees).toContain('data-module-page="fees"');
    expect(fees).toContain(`bg-gradient-to-br ${HERO_TONES.tangerine.cls}`); // the Finance group's banner
    expect(fees).toContain('data-page-banner="tangerine"');
    expect(fees).toContain('Finance');
    const help = renderToStaticMarkup(h(ModulePage, { moduleId: 'raise-ticket', title: 'Support tickets', purpose: 'p', children: 'x' }));
    expect(help).toContain(HERO_TONES.gold.cls);
    // A screen outside the registry (Control) names its own.
    const control = renderToStaticMarkup(h(ModulePage, { title: 'Users', purpose: 'p', icon: 'users', tone: 'azure', eyebrow: 'Control', children: 'x' }));
    expect(control).toContain(HERO_TONES.azure.cls);
    expect(control).toContain('Control');
  });

  it('shows ONE short line, and the longer explanation behind an ⓘ that opens it', () => {
    const html = renderToStaticMarkup(h(ModulePage, { moduleId: 'fees', title: 'Fees', purpose: 'What the school charges.', about: 'A change starts from a date.', children: 'x' }));
    expect(html).toContain('What the school charges.');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="([^"]+)"[^>]*data-page-about/);
    const panel = /aria-controls="([^"]+)"/.exec(html)![1];
    expect(html).toMatch(new RegExp(`<div id="${panel}" hidden=""[^>]*>A change starts from a date.</div>`));
    expect(html).toContain('<span class="sr-only">About this page</span>');
    // No about, no button.
    expect(renderToStaticMarkup(h(ModulePage, { title: 'T', purpose: 'p', children: 'x' }))).not.toContain('data-page-about');
  });

  it('puts "Show me how" and the one primary action on the banner’s white tray', () => {
    const html = renderToStaticMarkup(h(ModulePage, { title: 'Students', purpose: 'p', primary: h('button', null, 'Add'), children: 'x' }));
    const tray = html.slice(html.indexOf('data-banner-actions'));
    expect(tray).toMatch(/^data-banner-actions="true" class="[^"]*bg-white\/95/);
    expect(tray).toContain('<div data-slot="primary"><button>Add</button></div>');
    expect(renderToStaticMarkup(h(ModulePage, { title: 'T', purpose: 'p', children: 'x' }))).not.toContain('data-banner-actions');
  });

  it('the CI check passes on the repo, and its self-test catches a page with its own layout', () => {
    const run = (...args: string[]) => execFileSync('python3', [path.resolve(__dirname, '../../scripts/check_module_pages.py'), ...args], { encoding: 'utf8' });
    expect(run()).toMatch(/^PASS: \d+ \/app and \/control pages/);
    expect(run('--self-test')).toContain('SELF-TEST PASSED');
  });
});
