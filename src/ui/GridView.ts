import {
  compareValues,
  type ColumnDef,
  type DataGridColumnFilter,
  type DataGridSortDirection,
  type VisibleRow,
} from './DataGridTypes';
interface GridView<T extends object> {
  data: T[];
  columns: ColumnDef<T>[];
  rowFilter: ((row: T, index: number) => boolean) | null;
  searchQuery: string;
  columnFilters: Map<keyof T & string, DataGridColumnFilter<T>>;
  sortColumn: (keyof T & string) | null;
  sortDirection: DataGridSortDirection | null;
  readValue(row: T, key: keyof T & string): unknown;
  formatValue(value: unknown, column: ColumnDef<T>, row: T, index: number): string;
}
export function buildGridView<T extends object>(ctx: GridView<T>): VisibleRow<T>[] {
  let rows: VisibleRow<T>[] = ctx.data.map((row, rowIndex) => ({
    row,
    rowIndex,
    originalOrder: rowIndex,
  }));

  if (ctx.rowFilter) {
    rows = rows.filter((item) => ctx.rowFilter?.(item.row, item.rowIndex) !== false);
  }
  if (ctx.searchQuery) {
    rows = rows.filter((item) =>
      ctx.columns.some(
        (column) =>
          column.searchable !== false &&
          ctx
            .formatValue(ctx.readValue(item.row, column.key), column, item.row, item.rowIndex)
            .toLocaleLowerCase()
            .includes(ctx.searchQuery),
      ),
    );
  }
  for (const [columnKey, filter] of ctx.columnFilters) {
    const column = ctx.columns.find((item) => item.key === columnKey);
    if (!column) continue;
    rows = rows.filter((item) => {
      const value = ctx.readValue(item.row, columnKey);
      if (typeof filter === 'function') return filter(value, item.row, item.rowIndex);
      if (typeof filter === 'string') {
        return ctx
          .formatValue(value, column, item.row, item.rowIndex)
          .toLocaleLowerCase()
          .includes(filter.toLocaleLowerCase());
      }
      return filter.some((candidate) => Object.is(candidate, value));
    });
  }

  if (ctx.sortColumn && ctx.sortDirection) {
    const column = ctx.columns.find((item) => item.key === ctx.sortColumn);
    if (column) {
      const direction = ctx.sortDirection === 'asc' ? 1 : -1;
      rows.sort((left, right) => {
        const leftValue = ctx.readValue(left.row, column.key);
        const rightValue = ctx.readValue(right.row, column.key);
        const result = column.compare
          ? column.compare(leftValue, rightValue, left.row, right.row)
          : compareValues(leftValue, rightValue);
        return result === 0 ? left.originalOrder - right.originalOrder : result * direction;
      });
    }
  }
  return rows;
}
