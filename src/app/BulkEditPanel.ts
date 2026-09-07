import { parseDelimited } from '../io/DelimitedText';
import { FrameDocument } from '../models/FrameDocument';
import { type InputUnits, prepareCsvEdit } from '../services/BulkEdit';
import type { DataGrid, DataGridPasteStart } from '../ui/DataGrid';
import type { DialogService } from './DialogService';
import type { TabId } from './TabProviders';
import { createElement, labelled, localText } from './UiHelpers';

export async function previewPaste<T extends object>(
  grid: DataGrid<T>,
  text: string,
  start: DataGridPasteStart<T> | undefined,
  dialog: DialogService,
  stillCurrent: () => boolean,
): Promise<void> {
  const preview = grid.pasteTSV(text, start, { preview: true, atomic: true });
  const content = createElement('div');
  content.append(
    createElement(
      'p',
      undefined,
      localText(
        `${preview.changes.length}セルを変更 / 空欄は変更しません`,
        `${preview.changes.length} changes / blank cells are unchanged`,
      ),
    ),
  );
  for (const error of preview.errors)
    content.append(
      createElement(
        'p',
        'diagnostic-item error',
        `${error.rowIndex + 1}: ${error.columnKey}: ${error.message}`,
      ),
    );
  for (const cell of preview.changes.slice(0, 100))
    content.append(
      createElement(
        'p',
        undefined,
        `${cell.rowIndex + 1} / ${cell.columnKey}: ${String(cell.previousValue)} → ${String(cell.value)}`,
      ),
    );
  if (preview.changes.length > 100)
    content.append(
      createElement('p', undefined, localText('先頭100件を表示', 'Showing the first 100 changes')),
    );
  const apply = await dialog.confirm({
    title: localText('貼り付けプレビュー', 'Paste preview'),
    body: content,
    confirmLabel: preview.errors.length ? localText('閉じる', 'Close') : localText('適用', 'Apply'),
    cancelLabel: localText('キャンセル', 'Cancel'),
  });
  if (apply && !preview.errors.length && stillCurrent()) grid.pasteTSV(text, start, { atomic: true });
}

export async function importCsv(
  document: FrameDocument,
  tab: TabId,
  csv: string,
  columnKeys: readonly string[],
  dialog: DialogService,
  commit: (document: FrameDocument) => void,
): Promise<void> {
  const revision = document.revision;
  const rows = parseDelimited(csv);
  if (!rows.length) throw new Error('CSV is empty.');
  const content = createElement('div', 'panel-form');
  const mapping = rows[0].map((header) => {
    const select = createElement('select');
    for (const key of ['', ...columnKeys]) {
      const option = createElement('option', undefined, key || localText('無視', 'Ignore'));
      option.value = key;
      select.append(option);
    }
    select.value = columnKeys.includes(header) ? header : '';
    content.append(labelled(header, select));
    return select;
  });
  const mode = createElement('select');
  mode.innerHTML = '<option value="update">Update</option><option value="add">Add</option>';
  const units = createElement('select');
  units.innerHTML = '<option value="cm-kN">cm / kN</option><option value="mm-N">mm / N</option>';
  content.append(
    labelled(localText('入力方法', 'Operation'), mode),
    labelled(localText('入力単位', 'Input units'), units),
  );
  if (
    !(await dialog.confirm({ title: localText('CSV列の対応', 'Map CSV columns'), body: content })) ||
    revision !== document.revision
  )
    return;
  const preview = prepareCsvEdit(
    document,
    tab,
    csv,
    mapping.map((select) => select.value),
    mode.value as 'add' | 'update',
    units.value as InputUnits,
  );
  const report = createElement('div');
  report.append(createElement('p', undefined, `${preview.changes.length} ${localText('変更', 'changes')}`));
  for (const error of preview.errors) report.append(createElement('p', 'diagnostic-item error', error));
  for (const change of preview.changes.slice(0, 100)) report.append(createElement('p', undefined, change));
  const apply = await dialog.confirm({
    title: localText('CSVプレビュー', 'CSV preview'),
    body: report,
    confirmLabel: preview.errors.length ? localText('閉じる', 'Close') : localText('適用', 'Apply'),
  });
  if (apply && !preview.errors.length && revision === document.revision) commit(preview.document);
}
