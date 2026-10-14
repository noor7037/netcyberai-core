import { describe, expect, it } from 'vitest';
import { csvCell, csvResponse, toCsv } from '@/lib/export/csv';

// The one CSV writer (docs/26, P5).
describe('a CSV cell', () => {
  it('is written as text when a spreadsheet would run it as a formula, and left alone when it is a number', () => {
    for (const bad of ['=1+1', '+91 98765', '-cmd', '@sum', '\tx']) expect(csvCell(bad), bad).toBe(`'${bad}`);
    expect(csvCell('-12.5')).toBe('-12.5');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });
  it('is quoted when it holds a comma, a quote or a line break', () => {
    expect(csvCell('Sharma, Anita')).toBe('"Sharma, Anita"');
    expect(csvCell('said "yes"')).toBe('"said ""yes"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });
});

describe('a CSV file', () => {
  it('starts with the byte order mark, has the header first and CRLF line ends', () => {
    expect(toCsv(['Class', 'Present'], [['5-A', 31], ['कक्षा 6', null]])).toBe('﻿Class,Present\r\n5-A,31\r\nकक्षा 6,\r\n');
  });
  it('is sent as a download that is never cached, under a safe file name', async () => {
    const res = csvResponse('attendance 2026/10 "x"', 'a,b\r\n');
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="attendance-2026-10-x.csv"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('a,b\r\n');
  });
});
