import { describe, expect, it } from 'vitest';
import { gzipSync, inflateRawSync } from 'node:zlib';
import { columnName, crc32, sheetName, toXlsx, xlsxResponse, XLSX_TYPE, zip } from '@/lib/export/xlsx';

// The .xlsx writer (C235-D): the file is read back here the way a spreadsheet reads it, by its central directory, each
// part inflated and its CRC-32 checked, then the parts and the sheet's XML are looked at. Every name is made up.

// zlib's own CRC-32, independent of the writer's: a gzip member ends with the CRC-32 of its data, then its length.
const zlibCrc32 = (data: Uint8Array) => {
  const gz = gzipSync(data);
  return gz.readUInt32LE(gz.length - 8);
};

type Part = { name: string; data: Buffer; method: number; crc: number };
function unzip(file: Uint8Array): Part[] {
  const b = Buffer.from(file);
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end, 'an end of central directory record').toBeGreaterThanOrEqual(0);
  const count = b.readUInt16LE(end + 10);
  const size = b.readUInt32LE(end + 12);
  let at = b.readUInt32LE(end + 16);
  expect(at + size).toBe(end);
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    expect(b.readUInt32LE(at)).toBe(0x02014b50);
    const method = b.readUInt16LE(at + 10);
    const crc = b.readUInt32LE(at + 16);
    const packed = b.readUInt32LE(at + 20);
    const plain = b.readUInt32LE(at + 24);
    const nameLength = b.readUInt16LE(at + 28);
    const extra = b.readUInt16LE(at + 30);
    const comment = b.readUInt16LE(at + 32);
    const local = b.readUInt32LE(at + 42);
    const name = b.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    // The local header says the same as the directory.
    expect(b.readUInt32LE(local)).toBe(0x04034b50);
    expect(b.readUInt32LE(local + 14)).toBe(crc);
    expect(b.readUInt16LE(local + 26)).toBe(nameLength);
    const start = local + 30 + nameLength + b.readUInt16LE(local + 28);
    const data = method === 8 ? inflateRawSync(b.subarray(start, start + packed)) : b.subarray(start, start + packed);
    expect(data.length, name).toBe(plain);
    parts.push({ name, data, method, crc });
    at += 46 + nameLength + extra + comment;
  }
  return parts;
}
const part = (parts: Part[], name: string) => {
  const found = parts.find((p) => p.name === name);
  expect(found, name).toBeTruthy();
  return found!.data.toString('utf8');
};

describe('CRC-32', () => {
  it('is the ZIP one: the standard check value, and the same as zlib for any bytes', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    const bytes = new Uint8Array(5000).map((_, i) => (i * 7919) % 256);
    expect(crc32(bytes)).toBe(zlibCrc32(bytes));
  });
});

describe('the ZIP', () => {
  it('holds each file deflated, with its CRC, read back exactly', () => {
    const files = [
      { name: 'a.txt', data: new TextEncoder().encode('hello hello hello') },
      { name: 'dir/b.xml', data: new TextEncoder().encode('<x>नमस्ते</x>') },
    ];
    const parts = unzip(zip(files, new Date(Date.UTC(2026, 9, 15, 10, 30, 0))));
    expect(parts.map((p) => p.name)).toEqual(['a.txt', 'dir/b.xml']);
    for (const [i, p] of parts.entries()) {
      expect(p.method).toBe(8);
      expect(new Uint8Array(p.data)).toEqual(files[i].data);
      expect(p.crc).toBe(zlibCrc32(files[i].data));
    }
  });
});

describe('an .xlsx file', () => {
  const header = ['Name', 'Admission no', 'Class', 'Students'];
  const rows = [
    ['Aarav Example', '0012', '5-A', 31],
    ['=HYPERLINK("http://x.example","click")', '+91 98765', '@SUM(A1)', -4.5],
    ['Bela & <Co> "quoted"', '-cmd', null, Number.NaN],
    ['कक्षा छह', '', undefined, 0],
  ];
  const file = toXlsx('Students: 2026/27 [all]', header, rows, new Date(Date.UTC(2026, 9, 15)));
  const parts = unzip(file);

  it('is a ZIP that starts like every Office Open XML package', () => {
    expect(Buffer.from(file.subarray(0, 4)).toString('hex')).toBe('504b0304');
    expect(parts.map((p) => p.name).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  });

  it('names its parts and their relationships the way a spreadsheet looks for them', () => {
    const types = part(parts, '[Content_Types].xml');
    expect(types).toContain('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>');
    expect(types).toContain('<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    expect(types).toContain('PartName="/xl/styles.xml"');
    expect(part(parts, '_rels/.rels')).toContain('Target="xl/workbook.xml"');
    const rels = part(parts, 'xl/_rels/workbook.xml.rels');
    expect(rels).toContain('Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"');
    expect(rels).toContain('/styles" Target="styles.xml"');
    // The sheet's name has none of the characters a sheet name may not hold, and at most 31 characters.
    expect(part(parts, 'xl/workbook.xml')).toContain('<sheet name="Students  2026 27  all" sheetId="1" r:id="rId1"/>');
    for (const p of parts) expect(p.data.toString('utf8').startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), p.name).toBe(true);
  });

  it('writes a bold header row, text as inline text, numbers as numbers, and leaves empty cells out', () => {
    const sheet = part(parts, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<dimension ref="A1:D5"/>');
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<row r="1"><c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Name</t></is></c>');
    // "0012" stays text (an admission number keeps its zeros); 31 is a number.
    expect(sheet).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">0012</t></is></c>');
    expect(sheet).toContain('<c r="D2"><v>31</v></c>');
    expect(sheet).toContain('<c r="D3"><v>-4.5</v></c>');
    expect(sheet).toContain('<c r="D5"><v>0</v></c>');
    // Hindi is kept as it is.
    expect(sheet).toContain('<c r="A5" t="inlineStr"><is><t xml:space="preserve">कक्षा छह</t></is></c>');
    // null, undefined, '' and NaN are no cell at all.
    expect(sheet).not.toContain('r="C4"');
    expect(sheet).not.toContain('r="D4"');
    expect(sheet).not.toContain('r="B5"');
    expect(sheet).not.toContain('r="C5"');
    // No formula anywhere.
    expect(sheet).not.toContain('<f>');
  });

  it('writes a text a spreadsheet would run as a formula with an apostrophe in front, as the CSV does', () => {
    const sheet = part(parts, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">\'=HYPERLINK(&quot;http://x.example&quot;,&quot;click&quot;)</t></is></c>');
    expect(sheet).toContain('<t xml:space="preserve">\'+91 98765</t>');
    expect(sheet).toContain('<t xml:space="preserve">\'@SUM(A1)</t>');
    expect(sheet).toContain('<t xml:space="preserve">\'-cmd</t>');
  });

  it('escapes what XML must escape and drops what XML cannot hold', () => {
    const sheet = part(parts, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('Bela &amp; &lt;Co&gt; &quot;quoted&quot;');
    const odd = unzip(toXlsx('x', ['a'], [['bell\u0007 and \uD800 lone']]));
    expect(part(odd, 'xl/worksheets/sheet1.xml')).toContain('<t xml:space="preserve">bell and  lone</t>');
  });

  it('is sent as a download that is never cached, under a safe file name', async () => {
    const res = xlsxResponse('students 2026/10 "x"', file);
    expect(res.headers.get('Content-Type')).toBe(XLSX_TYPE);
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="students-2026-10-x.xlsx"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(file);
  });
});

describe('the small parts', () => {
  it('names columns past Z as a spreadsheet does', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
  it('keeps a sheet name within its rules', () => {
    expect(sheetName('a'.repeat(40))).toHaveLength(31);
    expect(sheetName('[]:*?/\\')).toBe('Sheet1');
  });
});
