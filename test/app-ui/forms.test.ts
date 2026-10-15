import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Radio, RadioGroup } from '@/components/ui/Radio';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { FLOAT_MAX } from '@/components/ui/field';
import { InfoTip } from '@/components/app-ui/InfoTip';

// Design system v5 form controls (C235-C): floating labels that stay real
// labels, helper text and errors under the field, and drawn checkboxes,
// radios and switches over the real native inputs.

const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => undefined;

describe('floating labels', () => {
  it('Input: a real label for the field, after it (the peer), resting where a placeholder would be', () => {
    const html = render(h(Input, { id: 'name', label: 'Full name', required: true, helperText: 'As on the admission form.' }));
    expect(html).toMatch(/<input id="name"[^>]*placeholder=" "[^>]*class="[^"]*\bpeer\b[^"]*placeholder:text-transparent focus:placeholder:text-slate\/70/);
    expect(html).toMatch(/<label for="name" class="[^"]*peer-focus:top-0[^"]*peer-placeholder-shown:top-1\/2/);
    expect(html.indexOf('<input')).toBeLessThan(html.indexOf('<label'));
    expect(html).toContain('Full name<span aria-hidden="true" class="text-red-800"> *</span><span class="sr-only"> (required)</span>');
    // The helper text is under the field, small, and is what the field is described by.
    expect(html).toContain('aria-describedby="name-message"');
    expect(html.indexOf('id="name-message"')).toBeGreaterThan(html.indexOf('<label'));
    expect(html).toMatch(/<p id="name-message" aria-live="polite" class="px-1 text-xs[^"]*"><span class="text-slate\/70">As on the admission form.<\/span>/);
  });

  it('Input keeps its API: the caller’s placeholder shows only with focus; errors and success sit under the field', () => {
    const hint = render(h(Input, { id: 'p', label: 'Phone', placeholder: '9800000001' }));
    expect(hint).toContain('placeholder="9800000001"');
    expect(hint).toContain('placeholder:text-transparent focus:placeholder:text-slate/70');
    const bad = render(h(Input, { id: 'e', label: 'Email', error: 'Type an email.' }));
    expect(bad).toContain('aria-invalid="true"');
    expect(bad).toContain('border-red-600');
    expect(bad).toContain('<span class="text-sm text-red-800">Type an email.</span>');
    expect(render(h(Input, { id: 's', label: 'Token', success: 'Looks right.' }))).toContain('text-emerald-text');
    expect(render(h(Input, { id: 'c', label: 'Code', pending: true }))).toContain('Checking…');
    expect(render(h(Input, { id: 'w', label: 'Width', className: 'flex-1' }))).toMatch(/<input[^>]*class="[^"]*flex-1"/);
  });

  it('a label too long to float sits above the field instead, never cut short; floating={false} asks for that too', () => {
    const long = 'L'.repeat(FLOAT_MAX + 1);
    const html = render(h(Input, { id: 'l', label: long }));
    expect(html.indexOf('<label')).toBeLessThan(html.indexOf('<input'));
    expect(html).not.toContain('placeholder=" "');
    expect(html).not.toContain('truncate');
    expect(render(h(Input, { id: 'f', label: 'Short', floating: false })).indexOf('<label')).toBeLessThan(render(h(Input, { id: 'f', label: 'Short', floating: false })).indexOf('<input'));
  });

  it('Select: the label rides on the top border (a select always shows a choice), a drawn chevron, the native control kept', () => {
    const html = render(h(Select, { id: 'cls', label: 'Class', helperText: 'Only your classes.', value: 'a', onChange: noop }, h('option', { value: 'a' }, '5-A')));
    expect(html).toMatch(/<select id="cls"[^>]*class="[^"]*appearance-none[^"]*"/);
    expect(html).toMatch(/<label for="cls" class="pointer-events-none absolute left-3 top-0[^"]*"/);
    expect(html).not.toContain('peer-placeholder-shown');
    expect(html).toContain('<path d="M6 8l4 4 4-4"></path>');
    expect(html).toContain('aria-describedby="cls-message"');
  });

  it('Textarea: rests at the first line, rises with focus or a value', () => {
    const html = render(h(Textarea, { id: 'note', label: 'Note', required: true, error: 'Write a note.' }));
    expect(html).toMatch(/<textarea id="note"[^>]*rows="4"[^>]*placeholder=" "/);
    expect(html).toContain('peer-placeholder-shown:top-6');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('Write a note.');
  });
});

describe('drawn controls over real inputs', () => {
  it('Checkbox: the native checkbox is the box (appearance-none), a decorative tick over it, a 44px label, a description in the label', () => {
    const html = render(h(Checkbox, { id: 'agree', label: 'Send me a copy', description: 'By email.', defaultChecked: true }));
    expect(html).toMatch(/<label for="agree" class="flex min-h-\[44px\]/);
    expect(html).toMatch(/<input id="agree" type="checkbox" class="peer[^"]*appearance-none[^"]*checked:bg-sapphire[^"]*focus-visible:outline-royal[^"]*motion-reduce:transition-none[^"]*" checked=""/);
    expect(html).toMatch(/<svg aria-hidden="true"[^>]*peer-checked:opacity-100/);
    expect(html).toContain('By email.');
  });

  it('Radio and RadioGroup: a fieldset with its legend, one name, the chosen one checked, the error under it', () => {
    const html = render(h(RadioGroup, { id: 'when', legend: 'When', value: 'today', onChange: noop, error: 'Choose one.', options: [{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week', description: 'Monday to Sunday' }] }));
    expect(html).toMatch(/^<fieldset id="when" aria-describedby="when-message" aria-invalid="true"/);
    expect(html).toContain('<legend class="mb-1 px-1 text-sm font-semibold text-slate">When</legend>');
    expect((html.match(/type="radio"/g) ?? []).length).toBe(2);
    expect((html.match(/name="when"/g) ?? []).length).toBe(2);
    expect(html).toMatch(/id="when-today" type="radio"[^>]*checked=""/);
    expect(html).not.toMatch(/id="when-week" type="radio"[^>]*checked=""/);
    expect(html).toContain('Monday to Sunday');
    expect(html).toContain('Choose one.');
    expect(render(h(Radio, { id: 'r', name: 'x', label: 'One' }))).toMatch(/<input id="r" type="radio" class="peer[^"]*appearance-none[^"]*rounded-full/);
  });

  it('SegmentedControl: native radios, one group with a legend, 44px segments, the chosen one raised', () => {
    const html = render(h(SegmentedControl, { id: 'range', label: 'Days', hideLabel: true, value: '7d', onChange: noop, options: [{ value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }] }));
    expect(html).toContain('<legend class="sr-only">Days</legend>');
    expect((html.match(/type="radio" name="range"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/checked="" value="7d"/);
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('peer-checked:bg-white');
    expect(html).toContain('peer-focus-visible:outline');
  });

  it('Switch: a real checkbox with role=switch, its state also said in words', () => {
    const html = render(h(Switch, { id: 'late', label: 'Charge a late fee', stateText: 'On', checked: true, onChange: noop }));
    expect(html).toMatch(/<input id="late" type="checkbox" role="switch"[^>]*checked=""/);
    expect(html).toContain('Charge a late fee');
    expect(html).toMatch(/<span class="font-normal text-slate\/70">: (<!-- -->)?On<\/span>/);
    expect(html).toContain('peer-checked:translate-x-5');
    expect(html).toContain('motion-reduce:transition-none');
  });
});

describe('InfoTip', () => {
  it('is a 44px button that says what it opens, and a hidden panel with every word in it', () => {
    const html = render(h(InfoTip, { label: 'About fees', children: 'A change starts from a date.' }));
    expect(html).toMatch(/<button type="button" aria-expanded="false" aria-controls="([^"]+)" title="About fees"[^>]*class="[^"]*h-11 w-11/);
    const id = /aria-controls="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`<div id="${id}" hidden="" data-info-panel="true" class="basis-full`);
    expect(html).toContain('A change starts from a date.');
    expect(html).toContain('<span class="sr-only">About fees</span>');
    expect(render(h(InfoTip, { children: 'x' }))).toContain('More about this');
  });
});
