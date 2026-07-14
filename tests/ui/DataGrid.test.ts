/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DataGrid,
  type ColumnDef,
  type DataGridChange,
  type DataGridSelectionChange,
} from '../../src/ui/DataGrid';

interface Row {
  id: number;
  name: string;
  enabled: boolean;
  kind: number;
}

const columns: ColumnDef<Row>[] = [
  { key: 'id', type: 'int', min: 1 },
  { key: 'name', type: 'text' },
  { key: 'enabled', type: 'checkbox' },
  {
    key: 'kind',
    type: 'select',
    enumOptions: [
      { value: 1, label: 'Primary' },
      { value: 2, label: 'Secondary' },
    ],
  },
];

function makeRows(): Row[] {
  return [
    { id: 2, name: 'Beta', enabled: false, kind: 2 },
    { id: 1, name: 'Alpha', enabled: true, kind: 1 },
    { id: 3, name: 'Gamma', enabled: false, kind: 1 },
  ];
}

describe('DataGrid', () => {
  let container: HTMLDivElement;
  let grid: DataGrid<Row> | null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    grid = null;
  });

  afterEach(() => {
    grid?.destroy();
    container.remove();
  });

  it('keeps the legacy constructor and reports a structured cell change', () => {
    const rows = makeRows();
    const changed = vi.fn<(change: DataGridChange<Row>) => void>();
    grid = new DataGrid(container, columns, rows);
    grid.setOnDataChanged(changed);

    const input = container.querySelector<HTMLInputElement>(
      'input[data-row-index="0"][data-column-key="name"]',
    )!;
    input.value = 'Edited';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(rows[0].name).toBe('Edited');
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0]).toMatchObject({
      source: 'edit',
      rowIndex: 0,
      columnKey: 'name',
      previousValue: 'Beta',
      value: 'Edited',
    });
  });

  it('supports multiple row selection and emits selected data', () => {
    const selectionChanged = vi.fn<(change: DataGridSelectionChange<Row>) => void>();
    grid = new DataGrid(container, columns, makeRows());
    grid.setOnSelectionChanged(selectionChanged);

    const rows = container.querySelectorAll<HTMLTableRowElement>('tbody tr');
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    expect(grid.getSelectedRowIndices()).toEqual([0, 1]);
    expect(grid.getSelectedRows().map(row => row.name)).toEqual(['Beta', 'Alpha']);
    const lastCall = selectionChanged.mock.calls[selectionChanged.mock.calls.length - 1];
    expect(lastCall[0].selectedRowIndices).toEqual([0, 1]);
  });

  it('enforces single-selection mode', () => {
    grid = new DataGrid(container, columns, makeRows(), { selectionMode: 'single' });
    grid.selectRow(0);
    grid.selectRow(1, { additive: true });
    expect(grid.getSelectedRowIndices()).toEqual([1]);
  });

  it('renders checkbox and select editors with typed values', () => {
    const rows = makeRows();
    grid = new DataGrid(container, columns, rows);
    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"][data-row-index="0"]',
    )!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    const select = container.querySelector<HTMLSelectElement>(
      'select[data-row-index="0"]',
    )!;
    select.value = '0';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(rows[0].enabled).toBe(true);
    expect(rows[0].kind).toBe(1);
  });

  it('shows validation feedback and preserves the previous numeric value', () => {
    const rows = makeRows();
    grid = new DataGrid(container, columns, rows);
    const input = container.querySelector<HTMLInputElement>(
      'input[data-row-index="0"][data-column-key="id"]',
    )!;
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(rows[0].id).toBe(2);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('.data-grid-cell-error')?.textContent).toContain('numeric');
  });

  it('pastes a typed rectangle once and skips read-only cells', () => {
    const rows = makeRows();
    const readonlyColumns: ColumnDef<Row>[] = [
      { ...columns[0], readOnly: true },
      ...columns.slice(1),
    ];
    const changed = vi.fn<(change: DataGridChange<Row>) => void>();
    grid = new DataGrid(container, readonlyColumns, rows);
    grid.setOnDataChanged(changed);

    const result = grid.pasteTSV('9\tChanged\r\n8\tAgain', {
      rowIndex: 0,
      columnIndex: 0,
    });

    expect(rows.slice(0, 2)).toMatchObject([
      { id: 2, name: 'Changed' },
      { id: 1, name: 'Again' },
    ]);
    expect(result.skippedReadOnlyCellCount).toBe(2);
    expect(result.appliedCellCount).toBe(2);
    expect(changed).toHaveBeenCalledOnce();
    expect(changed.mock.calls[0][0].changes).toHaveLength(2);
  });

  it('skips empty pasted cells without clearing numeric or checkbox values', () => {
    const rows = makeRows();
    const changed = vi.fn<(change: DataGridChange<Row>) => void>();
    grid = new DataGrid(container, columns, rows);
    grid.setOnDataChanged(changed);
    grid.setCellValidation(1, 'id', 'Stale numeric error.');
    grid.setCellValidation(1, 'enabled', 'Stale checkbox error.');

    const result = grid.pasteTSV('\t\t', {
      rowIndex: 1,
      columnIndex: 0,
    });

    expect(rows[1]).toEqual({ id: 1, name: 'Alpha', enabled: true, kind: 1 });
    expect(grid.getCellValidation(1, 'id')).toBeNull();
    expect(grid.getCellValidation(1, 'enabled')).toBeNull();
    expect(container.querySelector('.data-grid-cell-error')).toBeNull();
    expect(result).toMatchObject({ appliedCellCount: 0, errors: [], changes: [] });
    expect(changed).not.toHaveBeenCalled();
  });

  it('starts toolbar-style paste at the active selected row', () => {
    const rows = makeRows();
    grid = new DataGrid(container, columns, rows);
    grid.setActiveCell(0, 1);
    grid.selectRow(0);
    grid.selectRow(2);

    const result = grid.pasteTSV('9');

    expect(rows.map(row => row.id)).toEqual([2, 1, 9]);
    expect(rows[0].name).toBe('Beta');
    expect(result.appliedCellCount).toBe(1);
    expect(result.changes[0]).toMatchObject({ rowIndex: 2, columnKey: 'id', value: 9 });
  });

  it('searches, filters, and sorts the view without reordering source data', () => {
    const rows = makeRows();
    grid = new DataGrid(container, columns, rows);
    grid.setSort('id', 'asc');
    expect(grid.getVisibleRowIndices()).toEqual([1, 0, 2]);
    expect(rows.map(row => row.id)).toEqual([2, 1, 3]);

    grid.setSearchQuery('a');
    grid.setColumnFilter('enabled', [true]);
    expect(grid.getVisibleRowIndices()).toEqual([1]);

    grid.clearFilters();
    expect(grid.getVisibleRowIndices()).toEqual([1, 0, 2]);
  });

  it('moves focus between cells with the keyboard and scrolls to visible rows', () => {
    grid = new DataGrid(container, columns, makeRows());
    const first = container.querySelector<HTMLInputElement>(
      'input[data-row-index="0"][data-column-index="0"]',
    )!;
    const second = container.querySelector<HTMLInputElement>(
      'input[data-row-index="0"][data-column-index="1"]',
    )!;
    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(document.activeElement).toBe(second);
    expect(grid.scrollToRow(2, { columnKey: 'name', focus: true })).toBe(true);
    expect((document.activeElement as HTMLElement).dataset.rowIndex).toBe('2');
  });
});
