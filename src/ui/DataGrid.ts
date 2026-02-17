export interface ColumnDef<T> {
  key: keyof T & string;
  header: string;
  width?: string;
  type?: 'number' | 'text' | 'int';
  readOnly?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class DataGrid<T extends Record<string, any>> {
  private container: HTMLElement;
  private columns: ColumnDef<T>[];
  private data: T[];
  private table: HTMLTableElement;
  private onDataChanged: (() => void) | null = null;
  private changeHandler: ((e: Event) => void) | null = null;

  constructor(container: HTMLElement, columns: ColumnDef<T>[], data: T[]) {
    this.container = container;
    this.columns = columns;
    this.data = data;
    this.table = document.createElement('table');
    this.table.className = 'data-grid';
    this.container.appendChild(this.table);
    this.setupEventDelegation();
    this.render();
  }

  setOnDataChanged(cb: () => void): void {
    this.onDataChanged = cb;
  }

  setData(data: T[]): void {
    this.data = data;
    this.render();
  }

  private setupEventDelegation(): void {
    this.changeHandler = (e: Event) => {
      const input = e.target as HTMLInputElement;
      if (input.tagName !== 'INPUT') return;

      const rowIdx = parseInt(input.dataset.row ?? '', 10);
      const colKey = input.dataset.col;
      if (isNaN(rowIdx) || !colKey || rowIdx >= this.data.length) return;

      const col = this.columns.find(c => c.key === colKey);
      if (!col) return;

      const row = this.data[rowIdx];
      if (col.type === 'number') {
        row[col.key] = (parseFloat(input.value) || 0) as T[keyof T & string];
      } else if (col.type === 'int') {
        row[col.key] = (parseInt(input.value, 10) || 0) as T[keyof T & string];
      } else {
        row[col.key] = input.value as T[keyof T & string];
      }
      this.onDataChanged?.();
    };
    this.table.addEventListener('change', this.changeHandler);
  }

  render(): void {
    this.table.innerHTML = '';

    // ヘッダー
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of this.columns) {
      const th = document.createElement('th');
      th.textContent = col.header;
      if (col.width) th.style.width = col.width;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    this.table.appendChild(thead);

    // ボディ
    const tbody = document.createElement('tbody');
    for (let rowIdx = 0; rowIdx < this.data.length; rowIdx++) {
      const row = this.data[rowIdx];
      const tr = document.createElement('tr');

      for (const col of this.columns) {
        const td = document.createElement('td');
        const val = row[col.key];
        const input = document.createElement('input');
        input.type = (col.type === 'number' || col.type === 'int') ? 'number' : 'text';
        input.value = val != null ? String(val) : '';
        if (col.readOnly) input.readOnly = true;
        if (col.width) input.style.width = col.width;
        input.step = col.type === 'int' ? '1' : 'any';
        input.dataset.row = String(rowIdx);
        input.dataset.col = col.key;

        td.appendChild(input);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    this.table.appendChild(tbody);
  }

  destroy(): void {
    if (this.changeHandler) {
      this.table.removeEventListener('change', this.changeHandler);
      this.changeHandler = null;
    }
  }
}
