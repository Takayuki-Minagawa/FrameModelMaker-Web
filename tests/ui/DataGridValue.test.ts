import { describe, expect, it } from 'vitest';
import { coerceDataGridValue, type DataGridOption } from '../../src/ui/DataGrid';

describe('DataGrid value coercion', () => {
  it('keeps valid finite numeric values and rejects malformed values', () => {
    expect(coerceDataGridValue('number', '-1.25e3')).toEqual({ value: -1250 });
    expect(coerceDataGridValue('number', '')).toHaveProperty('error');
    expect(coerceDataGridValue('number', 'Infinity')).toHaveProperty('error');
  });

  it('does not truncate decimal values in integer cells', () => {
    expect(coerceDataGridValue('int', '12')).toEqual({ value: 12 });
    expect(coerceDataGridValue('int', '12.5')).toHaveProperty('error');
  });

  it('coerces common checkbox clipboard values', () => {
    expect(coerceDataGridValue('checkbox', '1')).toEqual({ value: true });
    expect(coerceDataGridValue('checkbox', 'false')).toEqual({ value: false });
    expect(coerceDataGridValue('checkbox', 'sometimes')).toHaveProperty('error');
  });

  it('resolves select candidates by stored value or display label', () => {
    const options: DataGridOption[] = [
      { value: 1, label: 'Pinned' },
      { value: 2, label: 'Fixed' },
    ];
    expect(coerceDataGridValue('select', '2', options)).toEqual({ value: 2 });
    expect(coerceDataGridValue('select', 'Pinned', options)).toEqual({ value: 1 });
    expect(coerceDataGridValue('select', 'Unknown', options)).toHaveProperty('error');
  });
});
