export type DataGridColumnType = 'number' | 'text' | 'int' | 'checkbox' | 'select' | 'enum' | 'reference';

export type DataGridSelectionMode = 'single' | 'multiple';
export type DataGridSortDirection = 'asc' | 'desc';
export type DataGridChangeSource = 'edit' | 'paste';
export type DataGridValidationSeverity = 'error' | 'warning';

export interface DataGridOption<Value = unknown> {
  value: Value;
  label: string;
  disabled?: boolean;
}

export type DataGridOptionLike = DataGridOption | string | number | boolean;

export interface DataGridOptionContext<T extends object> {
  row: T;
  rowIndex: number;
  column: ColumnDef<T>;
  data: readonly T[];
}

export type DataGridOptionSource<T extends object> =
  readonly DataGridOptionLike[] | ((context: DataGridOptionContext<T>) => readonly DataGridOptionLike[]);

export interface DataGridValidationIssue {
  message: string;
  severity?: DataGridValidationSeverity;
}

export type DataGridValidationResult = DataGridValidationIssue | string | null | undefined;

export interface DataGridValidationContext<T extends object> extends DataGridOptionContext<T> {
  value: unknown;
}

export interface ColumnDef<T extends object> {
  key: keyof T & string;
  header?: string;
  width?: string;
  type?: DataGridColumnType;
  readOnly?: boolean;
  required?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  step?: number | 'any';
  searchable?: boolean;
  /** Generic select candidates. */
  options?: DataGridOptionSource<T>;
  /** Static enum candidates; an explicit alias for schema-driven grids. */
  enumOptions?: readonly DataGridOptionLike[];
  /** Dynamic or static candidates sourced from another model collection. */
  referenceOptions?: DataGridOptionSource<T>;
  /** Highest-priority option provider for select/enum/reference cells. */
  getOptions?: (context: DataGridOptionContext<T>) => readonly DataGridOptionLike[];
  allowCustomValue?: boolean;
  parser?: (rawValue: string, context: DataGridOptionContext<T>) => unknown;
  formatter?: (value: unknown, context: DataGridOptionContext<T>) => string;
  validate?: (context: DataGridValidationContext<T>) => DataGridValidationResult;
  compare?: (left: unknown, right: unknown, leftRow: T, rightRow: T) => number;
}

export interface DataGridCellChange<T extends object> {
  rowIndex: number;
  columnKey: keyof T & string;
  previousValue: unknown;
  value: unknown;
  row: T;
}

export interface DataGridChange<T extends object> {
  source: DataGridChangeSource;
  /** First changed cell, provided as a convenience for single-cell edits. */
  rowIndex: number;
  columnKey: keyof T & string;
  previousValue: unknown;
  value: unknown;
  row: T;
  /** A paste emits one notification containing every accepted cell change. */
  changes: readonly DataGridCellChange<T>[];
}

export interface DataGridSelectionChange<T extends object> {
  selectedRowIndices: readonly number[];
  selectedRows: readonly T[];
  activeRowIndex: number | null;
}

export interface DataGridCellValidation<T extends object> extends DataGridValidationIssue {
  rowIndex: number;
  columnKey: keyof T & string;
}

export type DataGridColumnFilter<T extends object> =
  string | readonly unknown[] | ((value: unknown, row: T, rowIndex: number) => boolean);

export interface DataGridOptions<T extends object> {
  selectionMode?: DataGridSelectionMode;
  onPasteRequest?: (text: string, start?: DataGridPasteStart<T>) => void;
  onDataChanged?: (change: DataGridChange<T>) => void;
  onSelectionChanged?: (change: DataGridSelectionChange<T>) => void;
}

export interface DataGridSelectRowOptions {
  additive?: boolean;
  range?: boolean;
  scroll?: boolean;
  focus?: boolean;
  notify?: boolean;
}

export interface DataGridScrollOptions {
  columnKey?: string;
  focus?: boolean;
}

export interface DataGridPasteStart<T extends object> {
  rowIndex: number;
  columnKey?: keyof T & string;
  columnIndex?: number;
}

export interface DataGridPasteError<T extends object> extends DataGridCellValidation<T> {
  rawValue: string;
}

export interface DataGridPasteResult<T extends object> {
  appliedCellCount: number;
  skippedReadOnlyCellCount: number;
  errors: readonly DataGridPasteError<T>[];
  changes: readonly DataGridCellChange<T>[];
}

export interface DataGridValueResult {
  value?: unknown;
  error?: string;
}

export interface GridCoordinate {
  rowIndex: number;
  columnIndex: number;
}

export interface VisibleRow<T extends object> {
  row: T;
  rowIndex: number;
  originalOrder: number;
}

export function normalizeOption(option: DataGridOptionLike): DataGridOption {
  if (typeof option === 'object' && option !== null && 'value' in option) {
    return option;
  }
  return { value: option, label: String(option) };
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return Object.is(left, right) || String(left) === String(right);
}

/**
 * Convert an editor/clipboard string without silently replacing invalid
 * numbers with zero.  Exported so importers and tests can share grid rules.
 */
export function coerceDataGridValue(
  type: DataGridColumnType | undefined,
  rawValue: string,
  options: readonly DataGridOption[] = [],
  allowCustomValue = false,
): DataGridValueResult {
  if (type === 'number' || type === 'int') {
    if (rawValue.trim() === '') return { error: 'A numeric value is required.' };
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return { error: 'Enter a finite number.' };
    if (type === 'int' && !Number.isInteger(value)) {
      return { error: 'Enter an integer.' };
    }
    return { value };
  }

  if (type === 'checkbox') {
    const normalized = rawValue.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'checked'].includes(normalized)) return { value: true };
    if (['false', '0', 'no', 'off', 'unchecked', ''].includes(normalized)) return { value: false };
    return { error: 'Enter true/false or 1/0.' };
  }

  if (type === 'select' || type === 'enum' || type === 'reference') {
    const match = options.find((option) => String(option.value) === rawValue || option.label === rawValue);
    if (match) return { value: match.value };
    if (allowCustomValue) return { value: rawValue };
    return { error: 'Choose a value from the available options.' };
  }

  return { value: rawValue };
}

export function issueFrom(result: DataGridValidationResult): DataGridValidationIssue | null {
  if (result == null || result === '') return null;
  if (typeof result === 'string') return { message: result, severity: 'error' };
  return { message: result.message, severity: result.severity ?? 'error' };
}

export function compareValues(left: unknown, right: unknown): number {
  if (Object.is(left, right)) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}
