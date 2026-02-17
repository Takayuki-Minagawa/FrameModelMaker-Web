export class DataGrid {
    constructor(container, columns, data) {
        this.onDataChanged = null;
        this.container = container;
        this.columns = columns;
        this.data = data;
        this.table = document.createElement('table');
        this.table.className = 'data-grid';
        this.container.appendChild(this.table);
        this.render();
    }
    setOnDataChanged(cb) {
        this.onDataChanged = cb;
    }
    setData(data) {
        this.data = data;
        this.render();
    }
    render() {
        this.table.innerHTML = '';
        // ヘッダー
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (const col of this.columns) {
            const th = document.createElement('th');
            th.textContent = col.header;
            if (col.width)
                th.style.width = col.width;
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
                if (col.readOnly)
                    input.readOnly = true;
                if (col.width)
                    input.style.width = col.width;
                input.step = col.type === 'int' ? '1' : 'any';
                input.addEventListener('change', () => {
                    if (col.type === 'number') {
                        row[col.key] = parseFloat(input.value) || 0;
                    }
                    else if (col.type === 'int') {
                        row[col.key] = parseInt(input.value, 10) || 0;
                    }
                    else {
                        row[col.key] = input.value;
                    }
                    this.onDataChanged?.();
                });
                td.appendChild(input);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        this.table.appendChild(tbody);
    }
}
//# sourceMappingURL=DataGrid.js.map