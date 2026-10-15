// Minimal RFC4180-shaped CSV parser: quoted fields, embedded commas,
// embedded newlines inside quotes, "" as an escaped quote. No external
// dependency -- the format this project needs (a header row plus plain
// data rows a school exports from Excel/Google Sheets) doesn't need a
// general CSV library, and one more dependency is one more thing to
// audit for a feature this narrow.
export function parseCsv(text: string): string[][] {
  return parseCsvChecked(text).rows;
}

// The same, saying also whether the file ended inside a quoted field (a
// quote opened and never closed): the rest of the file was read as one
// value, so an import refuses such a file rather than guess (C235-A).
// A byte order mark at the start (Excel's "CSV UTF-8" writes one, and so
// does this app's own export) is not part of the first column's name.
export function parseCsvChecked(text: string): { rows: string[][]; unclosedQuote: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings up front so \r\n and \r alone behave the
  // same as \n inside the state machine below.
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // Final field/row, if the file doesn't end with a trailing newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop wholly-blank trailing rows (a common trailing-newline artifact).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) {
    rows.pop();
  }
  return { rows, unclosedQuote: inQuotes };
}

// Header row -> lowercased, trimmed column name, so "Admission No",
// "admission_no", and " Admission_No " all resolve the same way.
export function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((key, i) => {
      rec[key] = (r[i] ?? '').trim();
    });
    return rec;
  });
}
