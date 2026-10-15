import { deflateRawSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import { downloadFileName, formulaSafeText } from './csv';

// A small Excel (.xlsx) writer for the list exports (C235-D), with no spreadsheet library. An .xlsx file is an
// Office Open XML package: a ZIP of a few XML parts. This writes the fewest parts Excel, LibreOffice and Google
// Sheets open without a repair prompt:
//
//   [Content_Types].xml          what each part is
//   _rels/.rels                  the package's one relationship: the workbook
//   xl/workbook.xml              one sheet, by name
//   xl/_rels/workbook.xml.rels   the sheet and the styles
//   xl/styles.xml                two looks: plain, and bold for the header row
//   xl/worksheets/sheet1.xml     the rows
//
// The cells:
//   - a number is a number (a <v> the spreadsheet can add up), when it is finite;
//   - every other value is text, written inline (t="inlineStr"), never as a formula. A text that a spreadsheet would
//     run as a formula when it is copied out (it begins with =, +, -, @, a tab or a line break) gets an apostrophe in
//     front, exactly as in the CSV (formulaSafeText, ./csv.ts);
//   - an empty value is an empty cell; characters XML cannot hold are dropped; a text longer than Excel's cell
//     limit (32,767 characters) is cut there.
// The header row is bold and stays in view while scrolling. The ZIP is written here: each part deflated by Node's
// zlib, with its CRC-32 worked out below; no ZIP64 (an export is far below 4 GB).

export type XlsxValue = string | number | null | undefined;

// CRC-32 (the ZIP one: IEEE 802.3, reflected, polynomial 0xEDB88320), table driven.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A ZIP of the given files, each deflated. `modified` is the time written for each file (MS-DOS form, UTC).
export function zip(files: readonly { name: string; data: Uint8Array }[], modified: Date = new Date()): Uint8Array {
  const dosTime = (modified.getUTCHours() << 11) | (modified.getUTCMinutes() << 5) | Math.floor(modified.getUTCSeconds() / 2);
  const dosDate = ((Math.max(1980, modified.getUTCFullYear()) - 1980) << 9) | ((modified.getUTCMonth() + 1) << 5) | modified.getUTCDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const packed = deflateRawSync(file.data, { level: 9 });
    const crc = crc32(file.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed: 2.0 (deflate)
    local.writeUInt16LE(0x0800, 6); // the name is UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // no extra field
    name.copy(local, 30);
    locals.push(local, packed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4); // made by 2.0
    central.writeUInt16LE(20, 6); // needed 2.0
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra, comment, disk number, internal and external attributes: none (zero)
    central.writeUInt32LE(offset, 42); // where its local header starts
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + packed.length;
  }
  const directorySize = centrals.reduce((n, c) => n + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, ...centrals, end]));
}

// Characters XML 1.0 cannot hold (controls other than tab and line breaks, lone surrogates, U+FFFE and U+FFFF).
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
export const MAX_CELL_CHARS = 32767;

export function xmlText(value: string): string {
  return value.replace(NOT_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 0 -> A, 25 -> Z, 26 -> AA.
export function columnName(index: number): string {
  let n = index + 1;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// A sheet's name: at most 31 characters, none of : \ / ? * [ ].
export function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet1';
}

function cellXml(ref: string, value: XlsxValue, style: 0 | 1): string {
  if (value === null || value === undefined) return '';
  const s = style ? ' s="1"' : '';
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
  if (value === '') return '';
  const text = xmlText(formulaSafeText(value).slice(0, MAX_CELL_CHARS));
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

export function sheetXml(header: readonly string[], rows: readonly (readonly XlsxValue[])[]): string {
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const all: readonly (readonly XlsxValue[])[] = [header, ...rows];
  // A column as wide as its longest text (within reason), so the file opens readable.
  const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(8, ...all.map((r) => String(r[c] ?? '').length + 2))));
  const cols = widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = all
    .map((r, i) => `<row r="${i + 1}">${r.map((v, c) => cellXml(`${columnName(c)}${i + 1}`, v, i === 0 ? 1 : 0)).join('')}</row>`)
    .join('');
  const last = `${columnName(width - 1)}${all.length}`;
  return (
    `${XML_HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><dimension ref="A1:${last}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`
  );
}

// The parts of a one-sheet workbook, by their names in the package.
export function workbookParts(name: string, header: readonly string[], rows: readonly (readonly XlsxValue[])[]): { name: string; xml: string }[] {
  return [
    {
      name: '[Content_Types].xml',
      xml:
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      xml: `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      xml: `${XML_HEAD}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${xmlText(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      xml:
        `${XML_HEAD}<Relationships xmlns="${PKG_REL}">` +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    {
      name: 'xl/styles.xml',
      xml:
        `${XML_HEAD}<styleSheet xmlns="${MAIN}">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    },
    { name: 'xl/worksheets/sheet1.xml', xml: sheetXml(header, rows) },
  ];
}

// The .xlsx file: one sheet named `name`, the header row bold, then the rows.
export function toXlsx(name: string, header: readonly string[], rows: readonly (readonly XlsxValue[])[], modified: Date = new Date()): Uint8Array {
  return zip(
    workbookParts(name, header, rows).map((p) => ({ name: p.name, data: new Uint8Array(Buffer.from(p.xml, 'utf8')) })),
    modified
  );
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// A download that is never cached, under a safe file name (as csvResponse).
export function xlsxResponse(name: string, bytes: Uint8Array): NextResponse {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: { 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="${downloadFileName(name, 'xlsx')}"`, 'Cache-Control': 'no-store' },
  });
}
