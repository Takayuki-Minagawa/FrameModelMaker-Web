import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT_FILE_BYTES,
  assertImportFileSize,
  recordsToCsv,
  safeFilename,
} from '../../src/app/FileDownloads';

describe('FileDownloads', () => {
  describe('safeFilename', () => {
    it('trims the name and replaces characters that are invalid on common file systems', () => {
      expect(safeFilename('  frame<>:"/\\|?*model.json  ', 'model.json'))
        .toBe('frame_________model.json');
    });

    it('removes trailing dots and spaces without changing valid inner characters', () => {
      expect(safeFilename(' floor 2. model... ', 'model.json')).toBe('floor 2. model');
    });

    it('uses the fallback when sanitizing leaves no usable name', () => {
      expect(safeFilename(' ... ', 'untitled.json')).toBe('untitled.json');
    });

    it('replaces control characters instead of retaining invisible filename content', () => {
      expect(safeFilename('\u0000\u001f', 'untitled.json')).toBe('__');
    });
  });

  describe('recordsToCsv', () => {
    it('writes a UTF-8 BOM, stable CRLF rows, and the union of discovered columns', () => {
      const csv = recordsToCsv([
        { number: 1, x: 10 },
        { number: 2, y: 20 },
      ]);

      expect(csv).toBe('\uFEFFnumber,x,y\r\n1,10,\r\n2,,20');
    });

    it('honors an explicit column order and escapes commas, quotes, and newlines', () => {
      const csv = recordsToCsv(
        [{ note: 'A, "quoted"\nline', number: 7, ignored: true }],
        ['number', 'note', 'missing'],
      );

      expect(csv).toBe('\uFEFFnumber,note,missing\r\n7,"A, ""quoted""\nline",');
    });

    it('produces a header-only CSV for an empty collection with explicit keys', () => {
      expect(recordsToCsv([], ['number', 'name'])).toBe('\uFEFFnumber,name');
    });

    it('serializes nullish values as empty cells and other values through String', () => {
      expect(recordsToCsv([{ nil: null, absent: undefined, enabled: false, count: 0 }]))
        .toBe('\uFEFFnil,absent,enabled,count\r\n,,false,0');
    });

    it('neutralizes spreadsheet formulas in string cells without changing numeric values', () => {
      const csv = recordsToCsv([{
        formula: '=HYPERLINK("https://example.invalid")',
        spaced: '  +SUM(1,2)',
        newline: '\r\n-CMD()',
        at: '@cmd',
        numeric: -12,
      }]);

      expect(csv).toBe('\uFEFFformula,spaced,newline,at,numeric\r\n"\'=HYPERLINK(""https://example.invalid"")","\'  +SUM(1,2)","\'\r\n-CMD()",\'@cmd,-12');
    });
  });

  describe('assertImportFileSize', () => {
    it('accepts a file exactly at the configured limit', () => {
      const file = { size: MAX_IMPORT_FILE_BYTES } as File;
      expect(() => assertImportFileSize(file)).not.toThrow();
    });

    it('rejects a file over the limit with useful actual and maximum sizes', () => {
      const file = { size: 3 * 1024 * 1024 } as File;
      expect(() => assertImportFileSize(file, 2 * 1024 * 1024))
        .toThrow('File is too large (3.0 MB). Maximum: 2 MB.');
    });

    it('supports a small custom byte limit for callers and tests', () => {
      expect(() => assertImportFileSize({ size: 10 } as File, 9)).toThrow();
      expect(() => assertImportFileSize({ size: 9 } as File, 9)).not.toThrow();
    });
  });
});
