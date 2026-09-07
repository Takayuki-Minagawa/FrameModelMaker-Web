import { FrameDocument } from '../models/FrameDocument';
import { DocumentHistory } from '../services/DocumentHistory';
import type { DataGridChange } from '../ui/DataGrid';

/** One transactional entry point for model commands and already-applied grid edits. */
export class EditorController {
  constructor(
    readonly document: FrameDocument,
    readonly history: DocumentHistory,
  ) {}

  execute<T>(label: string, action: () => T): T {
    return this.history.runTransaction(label, () =>
      this.document.batchChanges(() => {
        const value = action();
        this.document.synchronizeBoundaryConditions();
        this.document.notifyChange();
        return value;
      }),
    );
  }

  commitGrid<T extends object>(change: DataGridChange<T>, apply?: (change: DataGridChange<T>) => void): void {
    // Grid owns its view rows. Restore them before capturing the transaction start.
    for (const cell of [...change.changes].reverse())
      Reflect.set(cell.row, cell.columnKey, cell.previousValue);
    this.execute(change.source === 'paste' ? 'Paste cells' : 'Edit cell', () => {
      for (const cell of change.changes) Reflect.set(cell.row, cell.columnKey, cell.value);
      apply?.(change);
    });
  }
}
