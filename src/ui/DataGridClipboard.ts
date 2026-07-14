/**
 * Parse tab-separated clipboard text.
 *
 * Excel and other spreadsheet applications quote cells containing tabs,
 * newlines, or quotes.  A small state machine is used instead of split() so
 * those cells can make a round trip through the grid.
 */
export function parseTSV(text: string): string[][] {
  if (text.length === 0) return [['']];

  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"' && value.length === 0) {
      quoted = true;
    } else if (char === '\t') {
      row.push(value);
      value = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value);
  rows.push(row);

  // Spreadsheet clipboard payloads conventionally end in a line break.  It
  // terminates the last row; it does not represent an additional empty row.
  if (/\r\n$|[\r\n]$/.test(text)) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
  }

  return rows.length > 0 ? rows : [['']];
}

function escapeTSVCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Serialize a rectangular matrix for a spreadsheet clipboard. */
export function serializeTSV(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(escapeTSVCell).join('\t')).join('\r\n');
}
