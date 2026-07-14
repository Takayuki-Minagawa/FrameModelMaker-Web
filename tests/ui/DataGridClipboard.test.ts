import { describe, expect, it } from 'vitest';
import { parseTSV, serializeTSV } from '../../src/ui/DataGridClipboard';

describe('DataGrid clipboard helpers', () => {
  it('parses a rectangular spreadsheet payload and ignores its terminator', () => {
    expect(parseTSV('1\t2\r\n3\t4\r\n')).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('supports quoted tabs, newlines, and escaped quotes', () => {
    expect(parseTSV('"a\tb"\t"line 1\nline 2"\t"say ""hi"""')).toEqual([
      ['a\tb', 'line 1\nline 2', 'say "hi"'],
    ]);
  });

  it('round trips values that need spreadsheet quoting', () => {
    const rows = [
      ['plain', 'with\ttab'],
      ['with\nnewline', 'with "quote"'],
    ];
    expect(parseTSV(serializeTSV(rows))).toEqual(rows);
  });

  it('represents an empty clipboard cell as one cell', () => {
    expect(parseTSV('')).toEqual([['']]);
  });
});
