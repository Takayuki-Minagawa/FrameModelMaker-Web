import { parseTSV, serializeTSV } from './DataGridClipboard';
import {
  ColumnDef,
  DataGridCellChange,
  DataGridCellValidation,
  DataGridChange,
  DataGridChangeSource,
  DataGridColumnFilter,
  DataGridOption,
  DataGridOptionContext,
  DataGridOptionLike,
  DataGridOptions,
  DataGridPasteError,
  DataGridPasteResult,
  DataGridPasteStart,
  DataGridScrollOptions,
  DataGridSelectRowOptions,
  DataGridSelectionChange,
  DataGridSelectionMode,
  DataGridSortDirection,
  DataGridValidationIssue,
  DataGridValidationResult,
  DataGridValidationSeverity,
  DataGridValueResult,
  GridCoordinate,
  VisibleRow,
  coerceDataGridValue,
  issueFrom,
  normalizeOption,
  valuesEqual,
} from './DataGridTypes';
import { buildGridView } from './GridView';
import { gridWindow } from './GridViewport';
export * from './DataGridTypes';
let nextGridId = 1;

export class DataGrid<T extends object> {
  private readonly container: HTMLElement;
  private columns: ColumnDef<T>[];
  private data: T[];
  private readonly table: HTMLTableElement;
  private readonly gridId: number;
  private visibleRows: VisibleRow<T>[] = [];
  private visibleRowPositions = new Map<number, number>();
  private selectionMode: DataGridSelectionMode;
  private selectedRowIndices = new Set<number>();
  private rowSelectionAnchor: number | null = null;
  private activeCell: GridCoordinate | null = null;
  private rangeAnchor: GridCoordinate | null = null;
  private onDataChanged: ((change: DataGridChange<T>) => void) | null;
  private onSelectionChanged: ((change: DataGridSelectionChange<T>) => void) | null;
  private searchQuery = '';
  private readonly columnFilters = new Map<keyof T & string, DataGridColumnFilter<T>>();
  private rowFilter: ((row: T, rowIndex: number) => boolean) | null = null;
  private sortColumn: (keyof T & string) | null = null;
  private sortDirection: DataGridSortDirection | null = null;
  private readonly validations = new Map<string, DataGridCellValidation<T>>();
  private destroyed = false;
  private editing = false;
  private readonly onPasteRequest: DataGridOptions<T>['onPasteRequest'];
  private readonly rowHeight = 34;
  private renderedStart = 0;
  private renderedEnd = 0;
  private readonly onScroll = () => {
    if (this.visibleRows.length <= 200) return;
    const start = Math.max(0, Math.floor(this.container.scrollTop / this.rowHeight) - 8);
    if (Math.abs(start - this.renderedStart) >= 6) this.renderBody();
  };

  constructor(container: HTMLElement, columns: ColumnDef<T>[], data: T[], options: DataGridOptions<T> = {}) {
    this.container = container;
    this.onPasteRequest = options.onPasteRequest;
    this.container.addEventListener('scroll', this.onScroll);
    this.columns = columns;
    this.data = data;
    this.selectionMode = options.selectionMode ?? 'multiple';
    this.onDataChanged = options.onDataChanged ?? null;
    this.onSelectionChanged = options.onSelectionChanged ?? null;
    this.gridId = nextGridId++;
    this.table = document.createElement('table');
    this.table.className = 'data-grid';
    this.table.setAttribute('role', 'grid');
    this.container.appendChild(this.table);
    this.setupEventDelegation();
    this.render();
  }

  setOnDataChanged(cb: ((change: DataGridChange<T>) => void) | null): void {
    this.onDataChanged = cb;
  }

  setOnSelectionChanged(cb: ((change: DataGridSelectionChange<T>) => void) | null): void {
    this.onSelectionChanged = cb;
  }

  setData(data: T[]): void {
    const previousSelection = this.getSelectedRowIndices();
    this.data = data;
    this.selectedRowIndices = new Set(previousSelection.filter((index) => index >= 0 && index < data.length));
    if (this.activeCell && this.activeCell.rowIndex >= data.length) this.activeCell = null;
    if (this.rangeAnchor && this.rangeAnchor.rowIndex >= data.length) this.rangeAnchor = null;
    this.validations.clear();
    this.render();
    if (!this.sameIndices(previousSelection, this.getSelectedRowIndices())) {
      this.notifySelectionChanged();
    }
  }

  getData(): readonly T[] {
    return this.data;
  }

  setColumns(columns: ColumnDef<T>[]): void {
    this.columns = columns;
    this.columnFilters.clear();
    this.sortColumn = null;
    this.sortDirection = null;
    this.activeCell = null;
    this.rangeAnchor = null;
    this.validations.clear();
    this.render();
  }

  getColumns(): readonly ColumnDef<T>[] {
    return this.columns;
  }

  getTableElement(): HTMLTableElement {
    return this.table;
  }

  setSelectionMode(mode: DataGridSelectionMode): void {
    if (this.selectionMode === mode) return;
    this.selectionMode = mode;
    if (mode === 'single' && this.selectedRowIndices.size > 1) {
      const first = this.getSelectedRowIndices()[0];
      this.selectedRowIndices = first == null ? new Set() : new Set([first]);
      this.notifySelectionChanged();
    }
    this.table.setAttribute('aria-multiselectable', String(mode === 'multiple'));
    this.updateSelectionDisplay();
  }

  getSelectionMode(): DataGridSelectionMode {
    return this.selectionMode;
  }

  selectRow(rowIndex: number, options: DataGridSelectRowOptions = {}): boolean {
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= this.data.length) return false;

    const previous = this.getSelectedRowIndices();
    const additive = this.selectionMode === 'multiple' && options.additive === true;
    const range = this.selectionMode === 'multiple' && options.range === true;

    if (range && this.rowSelectionAnchor != null) {
      const anchorPosition = this.visibleRowPositions.get(this.rowSelectionAnchor) ?? -1;
      const targetPosition = this.visibleRowPositions.get(rowIndex) ?? -1;
      if (anchorPosition >= 0 && targetPosition >= 0) {
        if (!additive) this.selectedRowIndices.clear();
        const from = Math.min(anchorPosition, targetPosition);
        const to = Math.max(anchorPosition, targetPosition);
        for (let index = from; index <= to; index++) {
          this.selectedRowIndices.add(this.visibleRows[index].rowIndex);
        }
      } else {
        this.selectedRowIndices = new Set([rowIndex]);
      }
    } else if (additive) {
      if (this.selectedRowIndices.has(rowIndex)) this.selectedRowIndices.delete(rowIndex);
      else this.selectedRowIndices.add(rowIndex);
      this.rowSelectionAnchor = rowIndex;
    } else {
      this.selectedRowIndices = new Set([rowIndex]);
      this.rowSelectionAnchor = rowIndex;
    }

    this.updateSelectionDisplay();
    const changed = !this.sameIndices(previous, this.getSelectedRowIndices());
    if (changed && options.notify !== false) this.notifySelectionChanged();
    if (options.scroll || options.focus) {
      this.scrollToRow(rowIndex, { focus: options.focus });
    }
    return true;
  }

  setSelectedRowIndices(indices: readonly number[], notify = true): void {
    const valid = indices.filter(
      (value, index) =>
        Number.isInteger(value) && value >= 0 && value < this.data.length && indices.indexOf(value) === index,
    );
    const next = this.selectionMode === 'single' ? valid.slice(0, 1) : valid;
    const previous = this.getSelectedRowIndices();
    this.selectedRowIndices = new Set(next);
    this.rowSelectionAnchor = next.length > 0 ? next[next.length - 1] : null;
    this.updateSelectionDisplay();
    if (notify && !this.sameIndices(previous, this.getSelectedRowIndices())) {
      this.notifySelectionChanged();
    }
  }

  clearSelection(notify = true): void {
    if (this.selectedRowIndices.size === 0) return;
    this.selectedRowIndices.clear();
    this.rowSelectionAnchor = null;
    this.updateSelectionDisplay();
    if (notify) this.notifySelectionChanged();
  }

  getSelectedRowIndices(): number[] {
    return [...this.selectedRowIndices].sort((left, right) => left - right);
  }

  getSelectedRows(): T[] {
    return this.getSelectedRowIndices().map((index) => this.data[index]);
  }

  getVisibleRowIndices(): number[] {
    return this.visibleRows.map((item) => item.rowIndex);
  }

  setSearchQuery(query: string): void {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized === this.searchQuery) return;
    this.searchQuery = normalized;
    this.render();
  }

  getSearchQuery(): string {
    return this.searchQuery;
  }

  setColumnFilter(columnKey: keyof T & string, filter: DataGridColumnFilter<T> | null): void {
    if (!this.columns.some((column) => column.key === columnKey)) return;
    if (filter == null || filter === '') this.columnFilters.delete(columnKey);
    else this.columnFilters.set(columnKey, filter);
    this.render();
  }

  setRowFilter(filter: ((row: T, rowIndex: number) => boolean) | null): void {
    this.rowFilter = filter;
    this.render();
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.columnFilters.clear();
    this.rowFilter = null;
    this.render();
  }

  setSort(columnKey: (keyof T & string) | null, direction: DataGridSortDirection | null = 'asc'): void {
    if (columnKey == null || direction == null) {
      this.sortColumn = null;
      this.sortDirection = null;
    } else if (this.columns.some((column) => column.key === columnKey)) {
      this.sortColumn = columnKey;
      this.sortDirection = direction;
    } else {
      return;
    }
    this.render();
  }

  getSort(): { columnKey: keyof T & string; direction: DataGridSortDirection } | null {
    if (!this.sortColumn || !this.sortDirection) return null;
    return { columnKey: this.sortColumn, direction: this.sortDirection };
  }

  scrollToRow(rowIndex: number, options: DataGridScrollOptions = {}): boolean {
    if (!this.visibleRowPositions.has(rowIndex)) return false;
    this.ensureRendered(rowIndex);
    let element: HTMLElement | null = this.table.querySelector(`tr[data-row-index="${rowIndex}"]`);
    if (options.columnKey) {
      const columnIndex = this.columns.findIndex((column) => column.key === options.columnKey);
      if (columnIndex >= 0) {
        element = this.table.querySelector(
          `td[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`,
        );
      }
    }
    if (!element) return false;
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (options.focus) {
      const editor = element.matches('td')
        ? element.querySelector<HTMLElement>('.data-grid-editor')
        : element.querySelector<HTMLElement>('.data-grid-editor');
      editor?.focus();
    }
    return true;
  }

  setActiveCell(rowIndex: number, column: number | (keyof T & string), extendRange = false): boolean {
    const columnIndex =
      typeof column === 'number' ? column : this.columns.findIndex((item) => item.key === column);
    if (columnIndex < 0 || columnIndex >= this.columns.length || !this.visibleRowPositions.has(rowIndex))
      return false;

    const coordinate = { rowIndex, columnIndex };
    if (!extendRange || !this.rangeAnchor) this.rangeAnchor = coordinate;
    this.activeCell = coordinate;
    this.updateSelectionDisplay();
    return true;
  }

  getSelectionAsTSV(): string {
    const matrix = this.getSelectedCellMatrix();
    return serializeTSV(matrix);
  }

  copySelection(): string {
    return this.getSelectionAsTSV();
  }

  pasteTSV(
    text: string,
    start?: DataGridPasteStart<T>,
    options: { preview?: boolean; atomic?: boolean } = {},
  ): DataGridPasteResult<T> {
    const cells = parseTSV(text);
    const startCoordinate = this.resolvePasteStart(start);
    if (!startCoordinate) {
      return { appliedCellCount: 0, skippedReadOnlyCellCount: 0, errors: [], changes: [] };
    }

    const startVisibleRow = this.visibleRowPositions.get(startCoordinate.rowIndex) ?? -1;
    const changes: DataGridCellChange<T>[] = [];
    const errors: DataGridPasteError<T>[] = [];
    let skippedReadOnlyCellCount = 0;
    let lastCoordinate = startCoordinate;
    const staged = new Map<T, T>();

    for (let pastedRow = 0; pastedRow < cells.length; pastedRow++) {
      const visible = this.visibleRows[startVisibleRow + pastedRow];
      if (!visible) {
        errors.push({
          rowIndex: cells.length,
          columnKey: this.columns[startCoordinate.columnIndex].key,
          message: 'Paste exceeds available rows.',
          severity: 'error',
          rawValue: '',
        });
        break;
      }
      const candidate =
        staged.get(visible.row) ??
        (Object.assign(Object.create(Object.getPrototypeOf(visible.row)), visible.row) as T);
      staged.set(visible.row, candidate);
      for (let pastedColumn = 0; pastedColumn < cells[pastedRow].length; pastedColumn++) {
        const columnIndex = startCoordinate.columnIndex + pastedColumn;
        const column = this.columns[columnIndex];
        if (!column) {
          errors.push({
            rowIndex: visible.rowIndex,
            columnKey: this.columns[startCoordinate.columnIndex].key,
            message: 'Paste exceeds available columns.',
            severity: 'error',
            rawValue: '',
          });
          break;
        }
        lastCoordinate = { rowIndex: visible.rowIndex, columnIndex };
        if (column.readOnly) {
          skippedReadOnlyCellCount++;
          continue;
        }

        const rawValue = cells[pastedRow][pastedColumn];
        const validationKey = this.validationKey(visible.rowIndex, column.key);
        if (rawValue === '') {
          if (!options.preview) this.validations.delete(validationKey);
          continue;
        }

        const converted = this.convertRawValue(rawValue, column, candidate, visible.rowIndex);
        if (converted.error) {
          const error = this.makeValidation(visible.rowIndex, column.key, converted.error, 'error');
          if (!options.preview) this.validations.set(validationKey, error);
          errors.push({ ...error, rawValue });
          continue;
        }

        const issue = this.validateValue(converted.value, column, candidate, visible.rowIndex);
        if (issue) {
          const error = this.makeValidation(
            visible.rowIndex,
            column.key,
            issue.message,
            issue.severity ?? 'error',
          );
          if (!options.preview) this.validations.set(validationKey, error);
          errors.push({ ...error, rawValue });
          continue;
        }

        if (!options.preview) this.validations.delete(validationKey);
        const previousValue = this.readValue(visible.row, column.key);
        if (!Object.is(previousValue, converted.value)) {
          this.writeValue(candidate, column.key, converted.value);
          changes.push({
            rowIndex: visible.rowIndex,
            columnKey: column.key,
            previousValue,
            value: converted.value,
            row: visible.row,
          });
        }
      }
    }

    const apply = !options.preview && !(options.atomic && errors.length > 0);
    if (apply) {
      for (const cell of changes) this.writeValue(cell.row, cell.columnKey, cell.value);
      try {
        if (changes.length > 0) this.emitDataChange('paste', changes);
      } catch (error) {
        for (const cell of [...changes].reverse())
          this.writeValue(cell.row, cell.columnKey, cell.previousValue);
        this.render();
        throw error;
      }
      this.rangeAnchor = startCoordinate;
      this.activeCell = lastCoordinate;
      this.render();
    }

    return {
      appliedCellCount: apply ? changes.length : 0,
      skippedReadOnlyCellCount,
      errors,
      changes,
    };
  }

  setCellValidation(rowIndex: number, columnKey: keyof T & string, issue: DataGridValidationResult): void {
    const normalized = issueFrom(issue);
    const key = this.validationKey(rowIndex, columnKey);
    if (normalized) {
      this.validations.set(
        key,
        this.makeValidation(rowIndex, columnKey, normalized.message, normalized.severity ?? 'error'),
      );
    } else {
      this.validations.delete(key);
    }
    this.updateCellValidationDisplay(rowIndex, columnKey);
  }

  getCellValidation(rowIndex: number, columnKey: keyof T & string): DataGridCellValidation<T> | null {
    return this.validations.get(this.validationKey(rowIndex, columnKey)) ?? null;
  }

  getValidationErrors(): DataGridCellValidation<T>[] {
    return [...this.validations.values()];
  }

  clearValidationErrors(): void {
    if (this.validations.size === 0) return;
    this.validations.clear();
    this.render();
  }

  validateAll(): DataGridCellValidation<T>[] {
    this.validations.clear();
    for (let rowIndex = 0; rowIndex < this.data.length; rowIndex++) {
      const row = this.data[rowIndex];
      for (const column of this.columns) {
        const issue = this.validateValue(this.readValue(row, column.key), column, row, rowIndex);
        if (issue) {
          this.validations.set(
            this.validationKey(rowIndex, column.key),
            this.makeValidation(rowIndex, column.key, issue.message, issue.severity ?? 'error'),
          );
        }
      }
    }
    this.render();
    return this.getValidationErrors();
  }

  render(): void {
    if (this.destroyed) return;
    this.rebuildVisibleRows();
    this.table.innerHTML = '';
    this.table.setAttribute('aria-rowcount', String(this.visibleRows.length + 1));
    this.table.setAttribute('aria-colcount', String(this.columns.length));
    this.table.setAttribute('aria-multiselectable', String(this.selectionMode === 'multiple'));

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.setAttribute('role', 'row');
    for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex++) {
      const column = this.columns[columnIndex];
      const th = document.createElement('th');
      th.setAttribute('role', 'columnheader');
      th.tabIndex = 0;
      th.dataset.columnIndex = String(columnIndex);
      th.dataset.columnKey = column.key;
      const label = column.header ?? column.key;
      const unit = column.unit ? ` (${column.unit})` : '';
      const direction = this.sortColumn === column.key ? this.sortDirection : null;
      const marker = direction === 'asc' ? ' ▲' : direction === 'desc' ? ' ▼' : '';
      th.textContent = `${label}${unit}${marker}`;
      th.setAttribute(
        'aria-sort',
        direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none',
      );
      th.setAttribute('aria-label', `${label}${unit}; activate to sort`);
      if (column.width) th.style.width = column.width;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    this.table.appendChild(thead);

    this.renderBody();
  }

  private renderBody(): void {
    const scrollTop = this.container.scrollTop;
    const window = gridWindow(
      this.visibleRows.length,
      scrollTop,
      this.container.clientHeight || 600,
      this.rowHeight,
    );
    this.table.querySelector('tbody')?.remove();
    const tbody = document.createElement('tbody');
    this.table.classList.toggle('data-grid-virtual', this.visibleRows.length > 200);
    this.renderedStart = window.start;
    this.renderedEnd = window.end;
    const spacer = (height: number) => {
      if (!height) return;
      const row = document.createElement('tr');
      row.setAttribute('aria-hidden', 'true');
      const cell = document.createElement('td');
      cell.colSpan = this.columns.length;
      cell.style.cssText = `height:${height}px;padding:0;border:0`;
      row.append(cell);
      tbody.append(row);
    };
    spacer(window.start * this.rowHeight);
    for (let visibleIndex = window.start; visibleIndex < window.end; visibleIndex++) {
      const { row, rowIndex } = this.visibleRows[visibleIndex];
      const tr = document.createElement('tr');
      tr.setAttribute('role', 'row');
      tr.setAttribute('aria-rowindex', String(visibleIndex + 2));
      if (this.visibleRows.length > 200) tr.style.height = `${this.rowHeight}px`;
      tr.dataset.rowIndex = String(rowIndex);
      tr.dataset.visibleIndex = String(visibleIndex);
      const selected = this.selectedRowIndices.has(rowIndex);
      tr.setAttribute('aria-selected', String(selected));
      tr.classList.toggle('selected', selected);
      if (selected) tr.style.background = 'var(--bg-grid-row-hover)';

      for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex++) {
        const column = this.columns[columnIndex];
        const td = document.createElement('td');
        td.setAttribute('role', 'gridcell');
        td.dataset.rowIndex = String(rowIndex);
        td.dataset.columnIndex = String(columnIndex);
        td.dataset.columnKey = column.key;
        td.className = 'data-grid-cell';
        const editor = this.createEditor(row, rowIndex, column, columnIndex);
        td.appendChild(editor);
        this.appendValidationDisplay(td, editor, rowIndex, column.key);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    spacer((this.visibleRows.length - window.end) * this.rowHeight);
    this.table.appendChild(tbody);
    this.container.scrollTop = scrollTop;
    this.updateSelectionDisplay();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.container.removeEventListener('scroll', this.onScroll);
    this.table.removeEventListener('change', this.changeHandler);
    this.table.removeEventListener('click', this.clickHandler);
    this.table.removeEventListener('keydown', this.keydownHandler);
    this.table.removeEventListener('copy', this.copyHandler);
    this.table.removeEventListener('paste', this.pasteHandler);
    this.destroyed = true;
    this.onDataChanged = null;
    this.onSelectionChanged = null;
  }

  private readonly changeHandler = (event: Event): void => {
    const editor = this.getEditor(event.target);
    if (!editor) return;
    this.commitEditor(editor);
  };

  private readonly clickHandler = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const header = target.closest<HTMLTableCellElement>('th[data-column-index]');
    if (header && this.table.contains(header)) {
      const columnIndex = Number(header.dataset.columnIndex);
      this.toggleSort(this.columns[columnIndex]?.key);
      return;
    }

    this.editing = target.matches('.data-grid-editor') && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    const cell = target.closest<HTMLTableCellElement>('td[data-row-index][data-column-index]');
    const row = cell ?? target.closest<HTMLTableRowElement>('tr[data-row-index]');
    if (!row || !this.table.contains(row)) return;
    const rowIndex = Number(row.dataset.rowIndex);
    const columnIndex = cell
      ? Number(cell.dataset.columnIndex)
      : Math.max(0, this.activeCell?.columnIndex ?? 0);
    this.setActiveCell(rowIndex, columnIndex, event.shiftKey);
    this.selectRow(rowIndex, {
      additive: event.ctrlKey || event.metaKey,
      range: event.shiftKey,
    });
  };

  private readonly keydownHandler = (event: KeyboardEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const header = target.closest<HTMLTableCellElement>('th[data-column-index]');
    if (header && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.toggleSort(this.columns[Number(header.dataset.columnIndex)]?.key);
      return;
    }

    const cell = target.closest<HTMLTableCellElement>('td[data-row-index][data-column-index]');
    if (!cell) return;
    const current: GridCoordinate = {
      rowIndex: Number(cell.dataset.rowIndex),
      columnIndex: Number(cell.dataset.columnIndex),
    };

    if (event.isComposing || event.keyCode === 229) return;
    const editor = this.getEditor(target);
    if (event.key === 'Tab') {
      this.leaveGrid(event);
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      this.editing = !this.editing;
      return;
    }
    if (this.editing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.editing = false;
        if (editor) {
          const column = this.columns[current.columnIndex];
          const value = this.readValue(this.data[current.rowIndex], column.key);
          if (editor instanceof HTMLInputElement && editor.type === 'checkbox')
            editor.checked = Boolean(value);
          else editor.value = String(value ?? '');
        }
      } else if (event.key === 'Enter' && editor && !(editor instanceof HTMLSelectElement)) {
        event.preventDefault();
        this.commitEditor(editor);
        this.editing = false;
      }
      return;
    }
    if (event.key === 'Tab') return;
    if (
      event.key === 'Enter' ||
      (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)
    ) {
      this.editing = true;
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      if (this.selectionMode === 'multiple') {
        this.setSelectedRowIndices(this.visibleRows.map((item) => item.rowIndex));
        if (this.visibleRows.length > 0 && this.columns.length > 0) {
          this.rangeAnchor = { rowIndex: this.visibleRows[0].rowIndex, columnIndex: 0 };
          this.activeCell = {
            rowIndex: this.visibleRows[this.visibleRows.length - 1].rowIndex,
            columnIndex: this.columns.length - 1,
          };
          this.updateSelectionDisplay();
        }
      }
      return;
    }

    let rowDelta = 0;
    let columnDelta = 0;
    let absoluteColumn: number | null = null;
    if (event.key === 'ArrowUp') rowDelta = -1;
    else if (event.key === 'ArrowDown' || event.key === 'Enter') rowDelta = 1;
    else if (event.key === 'ArrowLeft') columnDelta = -1;
    else if (event.key === 'ArrowRight') columnDelta = 1;
    else if (event.key === 'Home') absoluteColumn = 0;
    else if (event.key === 'End') absoluteColumn = this.columns.length - 1;
    else if (event.key === 'Tab') columnDelta = event.shiftKey ? -1 : 1;
    else return;

    event.preventDefault();
    this.moveCellFocus(current, rowDelta, columnDelta, absoluteColumn, event.shiftKey && event.key !== 'Tab');
  };

  private readonly copyHandler = (event: ClipboardEvent): void => {
    if (!event.clipboardData) return;
    if (this.editing && this.getEditor(event.target)) return;
    event.clipboardData.setData('text/plain', this.getSelectionAsTSV());
    event.preventDefault();
  };

  private readonly pasteHandler = (event: ClipboardEvent): void => {
    if (!event.clipboardData) return;
    const text = event.clipboardData.getData('text/plain');
    const editor = this.getEditor(event.target);
    const start = editor ? this.positionFromEditor(editor) : undefined;
    if (this.onPasteRequest) {
      this.onPasteRequest(text, start ?? undefined);
      event.preventDefault();
      return;
    }
    this.pasteTSV(text, start ? { rowIndex: start.rowIndex, columnIndex: start.columnIndex } : undefined);
    event.preventDefault();
  };

  private setupEventDelegation(): void {
    this.table.addEventListener('change', this.changeHandler);
    this.table.addEventListener('click', this.clickHandler);
    this.table.addEventListener('keydown', this.keydownHandler);
    this.table.addEventListener('copy', this.copyHandler);
    this.table.addEventListener('paste', this.pasteHandler);
  }

  private createEditor(
    row: T,
    rowIndex: number,
    column: ColumnDef<T>,
    columnIndex: number,
  ): HTMLInputElement | HTMLSelectElement {
    const value = this.readValue(row, column.key);
    let editor: HTMLInputElement | HTMLSelectElement;

    if (this.isSelectColumn(column)) {
      const select = document.createElement('select');
      const options = this.resolveOptions(column, row, rowIndex);
      let selected = false;
      for (let optionIndex = 0; optionIndex < options.length; optionIndex++) {
        const candidate = options[optionIndex];
        const option = document.createElement('option');
        option.value = String(optionIndex);
        option.dataset.optionIndex = String(optionIndex);
        option.textContent = candidate.label;
        option.disabled = candidate.disabled === true;
        option.selected = valuesEqual(candidate.value, value);
        if (option.selected) selected = true;
        select.appendChild(option);
      }
      if (!selected && value != null) {
        const unresolved = document.createElement('option');
        unresolved.value = '__current__';
        unresolved.dataset.currentValue = 'true';
        unresolved.textContent = String(value);
        unresolved.selected = true;
        select.insertBefore(unresolved, select.firstChild);
      }
      select.disabled = column.readOnly === true;
      editor = select;
    } else {
      const input = document.createElement('input');
      if (column.type === 'checkbox') {
        input.type = 'checkbox';
        input.checked = Boolean(value);
        input.disabled = column.readOnly === true;
      } else {
        input.type = column.type === 'number' || column.type === 'int' ? 'number' : 'text';
        input.value = value != null ? String(value) : '';
        input.readOnly = column.readOnly === true;
        if (column.type === 'int') input.step = String(column.step ?? 1);
        else if (column.type === 'number') input.step = String(column.step ?? 'any');
        if (column.min != null) input.min = String(column.min);
        if (column.max != null) input.max = String(column.max);
        input.required = column.required === true;
      }
      editor = input;
    }

    editor.classList.add('data-grid-editor');
    editor.dataset.rowIndex = String(rowIndex);
    editor.dataset.columnIndex = String(columnIndex);
    editor.dataset.columnKey = column.key;
    editor.setAttribute('aria-label', `${column.header ?? column.key}, row ${rowIndex + 1}`);
    return editor;
  }

  private commitEditor(editor: HTMLInputElement | HTMLSelectElement): void {
    const position = this.positionFromEditor(editor);
    if (!position) return;
    const column = this.columns[position.columnIndex];
    const row = this.data[position.rowIndex];
    if (!column || !row || column.readOnly) return;

    let converted: DataGridValueResult;
    if (editor instanceof HTMLSelectElement) {
      const selected = editor.selectedOptions[0];
      if (selected?.dataset.currentValue === 'true') {
        converted = { value: this.readValue(row, column.key) };
      } else {
        const options = this.resolveOptions(column, row, position.rowIndex);
        const optionIndex = Number(selected?.dataset.optionIndex);
        converted =
          Number.isInteger(optionIndex) && options[optionIndex]
            ? { value: options[optionIndex].value }
            : { error: 'Choose a value from the available options.' };
      }
    } else if (column.type === 'checkbox') {
      converted = { value: editor.checked };
    } else {
      converted = this.convertRawValue(editor.value, column, row, position.rowIndex);
    }

    if (converted.error) {
      this.setCellValidation(position.rowIndex, column.key, converted.error);
      return;
    }
    const issue = this.validateValue(converted.value, column, row, position.rowIndex);
    if (issue) {
      this.setCellValidation(position.rowIndex, column.key, issue);
      return;
    }

    this.setCellValidation(position.rowIndex, column.key, null);
    const previousValue = this.readValue(row, column.key);
    if (Object.is(previousValue, converted.value)) return;
    this.writeValue(row, column.key, converted.value);
    const change: DataGridCellChange<T> = {
      rowIndex: position.rowIndex,
      columnKey: column.key,
      previousValue,
      value: converted.value,
      row,
    };
    if (this.hasViewTransform()) this.render();
    this.emitDataChange('edit', [change]);
  }

  private convertRawValue(
    rawValue: string,
    column: ColumnDef<T>,
    row: T,
    rowIndex: number,
  ): DataGridValueResult {
    const context = this.makeOptionContext(column, row, rowIndex);
    if (column.parser) {
      try {
        return { value: column.parser(rawValue, context) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
    return coerceDataGridValue(
      column.type,
      rawValue,
      this.resolveOptions(column, row, rowIndex),
      column.allowCustomValue,
    );
  }

  private validateValue(
    value: unknown,
    column: ColumnDef<T>,
    row: T,
    rowIndex: number,
  ): DataGridValidationIssue | null {
    if (column.required && (value == null || value === '')) {
      return { message: 'A value is required.', severity: 'error' };
    }
    if ((column.type === 'number' || column.type === 'int') && typeof value !== 'number') {
      return { message: 'Enter a number.', severity: 'error' };
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return { message: 'Enter a finite number.', severity: 'error' };
      if (column.type === 'int' && !Number.isInteger(value)) {
        return { message: 'Enter an integer.', severity: 'error' };
      }
      if (column.min != null && value < column.min) {
        return { message: `Value must be at least ${column.min}.`, severity: 'error' };
      }
      if (column.max != null && value > column.max) {
        return { message: `Value must be at most ${column.max}.`, severity: 'error' };
      }
    }
    if (this.isSelectColumn(column) && !column.allowCustomValue) {
      const options = this.resolveOptions(column, row, rowIndex);
      if (!options.some((option) => valuesEqual(option.value, value))) {
        return { message: 'Choose a value from the available options.', severity: 'error' };
      }
    }
    return issueFrom(
      column.validate?.({
        ...this.makeOptionContext(column, row, rowIndex),
        value,
      }),
    );
  }

  private rebuildVisibleRows(): void {
    this.visibleRows = buildGridView({
      data: this.data,
      columns: this.columns,
      rowFilter: this.rowFilter,
      searchQuery: this.searchQuery,
      columnFilters: this.columnFilters,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection,
      readValue: this.readValue.bind(this),
      formatValue: this.formatValue.bind(this),
    });
    this.visibleRowPositions = new Map(this.visibleRows.map((item, position) => [item.rowIndex, position]));
  }

  private formatValue(value: unknown, column: ColumnDef<T>, row: T, rowIndex: number): string {
    const context = this.makeOptionContext(column, row, rowIndex);
    if (column.formatter) return column.formatter(value, context);
    if (this.isSelectColumn(column)) {
      const option = this.resolveOptions(column, row, rowIndex).find((candidate) =>
        valuesEqual(candidate.value, value),
      );
      if (option) return option.label;
    }
    if (column.type === 'checkbox') return value ? 'true' : 'false';
    return value == null ? '' : String(value);
  }

  private resolveOptions(column: ColumnDef<T>, row: T, rowIndex: number): DataGridOption[] {
    const context = this.makeOptionContext(column, row, rowIndex);
    let source: readonly DataGridOptionLike[] = [];
    if (column.getOptions) source = column.getOptions(context);
    else if (column.referenceOptions) {
      source =
        typeof column.referenceOptions === 'function'
          ? column.referenceOptions(context)
          : column.referenceOptions;
    } else if (column.enumOptions) source = column.enumOptions;
    else if (column.options) {
      source = typeof column.options === 'function' ? column.options(context) : column.options;
    }
    return source.map(normalizeOption);
  }

  private makeOptionContext(column: ColumnDef<T>, row: T, rowIndex: number): DataGridOptionContext<T> {
    return { column, row, rowIndex, data: this.data };
  }

  private isSelectColumn(column: ColumnDef<T>): boolean {
    return column.type === 'select' || column.type === 'enum' || column.type === 'reference';
  }

  private toggleSort(columnKey: (keyof T & string) | undefined): void {
    if (!columnKey) return;
    if (this.sortColumn !== columnKey) this.setSort(columnKey, 'asc');
    else if (this.sortDirection === 'asc') this.setSort(columnKey, 'desc');
    else this.setSort(null, null);
  }

  private moveCellFocus(
    current: GridCoordinate,
    rowDelta: number,
    columnDelta: number,
    absoluteColumn: number | null,
    extendRange: boolean,
  ): void {
    const visibleIndex = this.visibleRowPositions.get(current.rowIndex) ?? -1;
    if (visibleIndex < 0 || this.visibleRows.length === 0 || this.columns.length === 0) return;
    let nextVisibleIndex = visibleIndex + rowDelta;
    let nextColumnIndex = absoluteColumn ?? current.columnIndex + columnDelta;

    if (absoluteColumn == null && columnDelta !== 0) {
      if (nextColumnIndex >= this.columns.length) {
        nextColumnIndex = 0;
        nextVisibleIndex++;
      } else if (nextColumnIndex < 0) {
        nextColumnIndex = this.columns.length - 1;
        nextVisibleIndex--;
      }
    }
    nextVisibleIndex = Math.max(0, Math.min(this.visibleRows.length - 1, nextVisibleIndex));
    nextColumnIndex = Math.max(0, Math.min(this.columns.length - 1, nextColumnIndex));
    const rowIndex = this.visibleRows[nextVisibleIndex].rowIndex;
    this.setActiveCell(rowIndex, nextColumnIndex, extendRange);
    this.selectRow(rowIndex, { range: extendRange });
    this.focusCell(rowIndex, nextColumnIndex);
  }

  private leaveGrid(event: KeyboardEvent): void {
    const candidates = [
      ...document.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], summary, [tabindex]',
      ),
    ].filter(
      (element) =>
        !this.table.contains(element) &&
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        !element.closest('[inert]') &&
        element.getClientRects().length > 0,
    );
    const direction = event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
    const outside = candidates.filter((element) =>
      Boolean(this.table.compareDocumentPosition(element) & direction),
    );
    const target = event.shiftKey ? outside.at(-1) : outside[0];
    if (target) {
      event.preventDefault();
      this.editing = false;
      target.focus();
    }
  }

  private ensureRendered(rowIndex: number): void {
    const position = this.visibleRowPositions.get(rowIndex);
    if (position == null || (position >= this.renderedStart && position < this.renderedEnd)) return;
    this.container.scrollTop = position * this.rowHeight;
    this.renderBody();
  }

  private focusCell(rowIndex: number, columnIndex: number): void {
    this.editing = false;
    this.ensureRendered(rowIndex);
    const editor = this.table.querySelector<HTMLElement>(
      `.data-grid-editor[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`,
    );
    editor?.focus();
    const cell = editor?.closest<HTMLElement>('td');
    if (cell && typeof cell.scrollIntoView === 'function') {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  private getSelectedCellMatrix(): unknown[][] {
    const bounds = this.getRangeBounds();
    if (bounds) {
      const rows: unknown[][] = [];
      for (let rowPosition = bounds.startRow; rowPosition <= bounds.endRow; rowPosition++) {
        const visible = this.visibleRows[rowPosition];
        const values: unknown[] = [];
        for (let columnIndex = bounds.startColumn; columnIndex <= bounds.endColumn; columnIndex++) {
          const column = this.columns[columnIndex];
          values.push(
            this.formatValue(this.readValue(visible.row, column.key), column, visible.row, visible.rowIndex),
          );
        }
        rows.push(values);
      }
      return rows;
    }

    return this.visibleRows
      .filter((item) => this.selectedRowIndices.has(item.rowIndex))
      .map((item) =>
        this.columns.map((column) =>
          this.formatValue(this.readValue(item.row, column.key), column, item.row, item.rowIndex),
        ),
      );
  }

  private getRangeBounds(): {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  } | null {
    if (!this.activeCell) return null;
    const anchor = this.rangeAnchor ?? this.activeCell;
    const activeRow = this.visibleRowPositions.get(this.activeCell.rowIndex) ?? -1;
    const anchorRow = this.visibleRowPositions.get(anchor.rowIndex) ?? -1;
    if (activeRow < 0 || anchorRow < 0) return null;
    return {
      startRow: Math.min(activeRow, anchorRow),
      endRow: Math.max(activeRow, anchorRow),
      startColumn: Math.min(this.activeCell.columnIndex, anchor.columnIndex),
      endColumn: Math.max(this.activeCell.columnIndex, anchor.columnIndex),
    };
  }

  private resolvePasteStart(start?: DataGridPasteStart<T>): GridCoordinate | null {
    if (start) {
      const columnIndex =
        start.columnIndex ??
        (start.columnKey == null ? -1 : this.columns.findIndex((column) => column.key === start.columnKey));
      if (
        columnIndex >= 0 &&
        columnIndex < this.columns.length &&
        this.visibleRowPositions.has(start.rowIndex)
      )
        return { rowIndex: start.rowIndex, columnIndex };
      return null;
    }
    if (
      this.activeCell &&
      this.selectedRowIndices.has(this.activeCell.rowIndex) &&
      this.visibleRowPositions.has(this.activeCell.rowIndex)
    )
      return this.activeCell;
    if (
      this.rowSelectionAnchor != null &&
      this.selectedRowIndices.has(this.rowSelectionAnchor) &&
      this.visibleRowPositions.has(this.rowSelectionAnchor) &&
      this.columns.length > 0
    )
      return { rowIndex: this.rowSelectionAnchor, columnIndex: 0 };
    if (this.activeCell && this.visibleRowPositions.has(this.activeCell.rowIndex)) {
      return this.activeCell;
    }
    const first = this.visibleRows[0];
    return first && this.columns.length > 0 ? { rowIndex: first.rowIndex, columnIndex: 0 } : null;
  }

  private updateSelectionDisplay(): void {
    const bounds = this.getRangeBounds();
    const rows = this.table.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row-index]');
    rows.forEach((row) => {
      const rowIndex = Number(row.dataset.rowIndex);
      const selected = this.selectedRowIndices.has(rowIndex);
      row.classList.toggle('selected', selected);
      row.setAttribute('aria-selected', String(selected));
      row.style.background = selected ? 'var(--bg-grid-row-hover)' : '';
    });

    const cells = this.table.querySelectorAll<HTMLTableCellElement>('td[data-row-index][data-column-index]');
    cells.forEach((cell) => {
      const rowIndex = Number(cell.dataset.rowIndex);
      const columnIndex = Number(cell.dataset.columnIndex);
      const visibleIndex = this.visibleRowPositions.get(rowIndex) ?? -1;
      const inRange =
        bounds != null &&
        visibleIndex >= bounds.startRow &&
        visibleIndex <= bounds.endRow &&
        columnIndex >= bounds.startColumn &&
        columnIndex <= bounds.endColumn;
      const active = this.activeCell?.rowIndex === rowIndex && this.activeCell.columnIndex === columnIndex;
      cell.classList.toggle('range-selected', inRange);
      cell.classList.toggle('active', active);
      const editor = cell.querySelector<HTMLElement>('.data-grid-editor');
      if (editor)
        editor.tabIndex = active || (!this.activeCell && visibleIndex === 0 && columnIndex === 0) ? 0 : -1;
      cell.style.boxShadow = active
        ? 'inset 0 0 0 2px var(--accent)'
        : inRange
          ? 'inset 0 0 0 1px var(--accent)'
          : '';
    });
  }

  private notifySelectionChanged(): void {
    const selectedRowIndices = this.getSelectedRowIndices();
    this.onSelectionChanged?.({
      selectedRowIndices,
      selectedRows: selectedRowIndices.map((index) => this.data[index]),
      activeRowIndex: this.activeCell?.rowIndex ?? selectedRowIndices[0] ?? null,
    });
  }

  private emitDataChange(source: DataGridChangeSource, changes: DataGridCellChange<T>[]): void {
    const first = changes[0];
    if (!first) return;
    this.onDataChanged?.({ source, ...first, changes });
  }

  private appendValidationDisplay(
    cell: HTMLTableCellElement,
    editor: HTMLInputElement | HTMLSelectElement,
    rowIndex: number,
    columnKey: keyof T & string,
  ): void {
    const issue = this.getCellValidation(rowIndex, columnKey);
    if (!issue) return;
    const id = `data-grid-${this.gridId}-error-${rowIndex}-${String(columnKey)}`;
    const error = document.createElement('span');
    error.id = id;
    error.className = `data-grid-cell-error ${issue.severity ?? 'error'}`;
    error.setAttribute('role', issue.severity === 'warning' ? 'status' : 'alert');
    error.textContent = issue.message;
    error.style.display = 'block';
    error.style.color = issue.severity === 'warning' ? '#b26a00' : '#c62828';
    error.style.fontSize = '10px';
    error.style.overflowWrap = 'anywhere';
    cell.classList.add('invalid');
    cell.dataset.validationMessage = issue.message;
    cell.title = issue.message;
    editor.setAttribute('aria-invalid', String(issue.severity !== 'warning'));
    editor.setAttribute('aria-describedby', id);
    cell.appendChild(error);
  }

  private updateCellValidationDisplay(rowIndex: number, columnKey: keyof T & string): void {
    const columnIndex = this.columns.findIndex((column) => column.key === columnKey);
    if (columnIndex < 0) return;
    const cell = this.table.querySelector<HTMLTableCellElement>(
      `td[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`,
    );
    if (!cell) return;
    cell.querySelector('.data-grid-cell-error')?.remove();
    cell.classList.remove('invalid');
    delete cell.dataset.validationMessage;
    cell.removeAttribute('title');
    const editor = cell.querySelector<HTMLInputElement | HTMLSelectElement>('.data-grid-editor');
    if (!editor) return;
    editor.removeAttribute('aria-invalid');
    editor.removeAttribute('aria-describedby');
    this.appendValidationDisplay(cell, editor, rowIndex, columnKey);
  }

  private makeValidation(
    rowIndex: number,
    columnKey: keyof T & string,
    message: string,
    severity: DataGridValidationSeverity,
  ): DataGridCellValidation<T> {
    return { rowIndex, columnKey, message, severity };
  }

  private validationKey(rowIndex: number, columnKey: keyof T & string): string {
    return `${rowIndex}\u0000${columnKey}`;
  }

  private getEditor(target: EventTarget | null): HTMLInputElement | HTMLSelectElement | null {
    if (!(target instanceof Element)) return null;
    const editor = target.closest<HTMLInputElement | HTMLSelectElement>('.data-grid-editor');
    return editor && this.table.contains(editor) ? editor : null;
  }

  private positionFromEditor(editor: HTMLInputElement | HTMLSelectElement): GridCoordinate | null {
    const rowIndex = Number(editor.dataset.rowIndex);
    const columnIndex = Number(editor.dataset.columnIndex);
    if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
    return { rowIndex, columnIndex };
  }

  private readValue(row: T, columnKey: keyof T & string): unknown {
    return (row as Record<string, unknown>)[columnKey];
  }

  private writeValue(row: T, columnKey: keyof T & string, value: unknown): void {
    (row as Record<string, unknown>)[columnKey] = value;
  }

  private hasViewTransform(): boolean {
    return (
      this.searchQuery !== '' ||
      this.columnFilters.size > 0 ||
      this.rowFilter != null ||
      this.sortColumn != null
    );
  }

  private sameIndices(left: readonly number[], right: readonly number[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
}

export { parseTSV, serializeTSV } from './DataGridClipboard';
