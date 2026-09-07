import type { ImportDiagnostic as UnifiedDiagnostic } from '../io/ImportDocument';
import { diagnosticDownloads, importPreview } from './ImportPreview';
import { ImportService } from './ImportService';
import { RecoveryPanel } from './RecoveryPanel';
import { createButton, createElement, localText } from './UiHelpers';

import { t } from '../i18n';
import { parseFrameJson, writeFrameJson } from '../io/FrameJson';
import { FrameDocument } from '../models/FrameDocument';
import { DocumentHistory } from '../services/DocumentHistory';
import { DataGrid } from '../ui/DataGrid';
import { validateFrameDocument } from '../validation/FrameValidator';
import { DialogService } from './DialogService';
import { assertImportFileSize, downloadText, recordsToCsv, safeFilename } from './FileDownloads';
import { ToolPanel } from './ToolPanel';

export function createFileOperations(context: {
  doc: FrameDocument;
  history: DocumentHistory;
  dialogService: DialogService;
  toolPanel: ToolPanel;
  grid(): DataGrid<Record<string, unknown>> | null;
  tab(): string;
  recovery(): RecoveryPanel;
  reportError(error: unknown): void;
  refreshDocumentUi(fit: boolean): void;
  invalidateAnalysisResults(): boolean;
  resetViewerSelection(): void;
  updateDirtyUi(): void;
  updateStatus(message: string): void;
  showValidationPanel(): void;
  selectDiagnosticTarget(kind: string, number?: number): void;
}) {
  const {
    doc,
    history,
    dialogService,
    toolPanel,
    reportError,
    refreshDocumentUi,
    invalidateAnalysisResults,
    resetViewerSelection,
    updateDirtyUi,
    updateStatus,
    showValidationPanel,
    selectDiagnosticTarget,
  } = context;
  const DEFAULT_MODEL_NAME = 'frame-model';
  const imports = new ImportService();
  let importRequest = 0;
  let lastImportDiagnostics: UnifiedDiagnostic[] = [];
  let currentFileBase = DEFAULT_MODEL_NAME;
  async function createNewDocument(): Promise<void> {
    imports.cancel();
    importRequest++;
    if (!(await confirmDiscardChanges())) return;
    doc.init();
    history.reset(true);
    context.recovery().newModel();
    currentFileBase = DEFAULT_MODEL_NAME;
    lastImportDiagnostics = [];
    invalidateAnalysisResults();
    resetViewerSelection();
    refreshDocumentUi(true);
    updateStatus(t('status.newCreated'));
  }

  async function confirmDiscardChanges(): Promise<boolean> {
    if (!history.isDirty) return true;
    return dialogService.confirm({
      title: t('dialog.unsavedTitle'),
      body: t('dialog.unsavedBody'),
      confirmLabel: t('dialog.confirm'),
      cancelLabel: t('dialog.cancel'),
      destructive: true,
    });
  }

  async function openFilePicker(): Promise<void> {
    if (!(await confirmDiscardChanges())) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.yaml,.yml';
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        if (file) void loadModelFile(file).catch(reportError);
      },
      { once: true },
    );
    input.click();
  }

  async function loadModelFile(file: File): Promise<void> {
    assertImportFileSize(file);
    const request = ++importRequest;
    const revision = doc.revision;
    const text = await file.text();
    if (request !== importRequest || revision !== doc.revision) return;
    const format = /\.ya?ml$/i.test(file.name) ? 'yaml' : 'json';
    const result = await imports.prepare(text, format, revision);
    if (request !== importRequest || revision !== doc.revision) return;
    const apply = await dialogService.confirm({
      title: localText('読込プレビュー', 'Import preview'),
      body: importPreview(file.name, result),
      confirmLabel: result.errorCount ? localText('閉じる', 'Close') : localText('適用', 'Apply'),
      cancelLabel: t('dialog.cancel'),
    });
    if (!apply || result.errorCount || request !== importRequest || revision !== doc.revision) return;
    const incoming = new FrameDocument();
    parseFrameJson(JSON.stringify(result.model), incoming, { mode: 'strict' });
    if (!replaceDocument(incoming, file.name, result.diagnostics)) return;
    updateStatus(t('status.fileLoaded', file.name, doc.nodes.length, doc.members.length));
  }

  function replaceDocument(
    incoming: FrameDocument,
    fileName: string,
    diagnostics: UnifiedDiagnostic[],
  ): boolean {
    const validation = validateFrameDocument(incoming);
    diagnostics = [...diagnostics];
    diagnostics.push(
      ...validation.diagnostics
        .filter(
          (item) =>
            !diagnostics.some((existing) => existing.code === item.code && existing.message === item.message),
        )
        .map((item) => ({
          level: item.severity === 'warning' ? ('warn' as const) : item.severity,
          code: item.code,
          message: item.message,
          target: { kind: item.entity.kind, number: item.entity.number },
        })),
    );
    if (validation.errorCount > 0) {
      lastImportDiagnostics = diagnostics;
      showImportReport();
      updateStatus(
        localText(
          `読込を中止しました。モデル検証エラー ${validation.errorCount}件（現在のモデルは変更されていません）`,
          `Import stopped with ${validation.errorCount} model validation errors; the current model was not changed.`,
        ),
      );
      return false;
    }
    doc.replaceWith(incoming);
    history.reset(true);
    context.recovery().newModel();
    currentFileBase = fileName.replace(/\.(?:json|ya?ml)$/i, '') || DEFAULT_MODEL_NAME;
    lastImportDiagnostics = diagnostics;
    invalidateAnalysisResults();
    resetViewerSelection();
    refreshDocumentUi(true);
    return true;
  }

  async function saveJson(): Promise<void> {
    const validation = validateFrameDocument(doc);
    if (validation.errorCount > 0) {
      const proceed = await dialogService.confirm({
        title: localText('検証エラーがあります', 'Validation errors found'),
        body: localText(
          `エラーが${validation.errorCount}件あります。それでもJSONを保存しますか？`,
          `There are ${validation.errorCount} errors. Save the JSON anyway?`,
        ),
        confirmLabel: localText('保存する', 'Save anyway'),
        cancelLabel: t('dialog.cancel'),
        destructive: true,
      });
      if (!proceed) {
        showValidationPanel();
        return;
      }
    }
    const fileName = `${safeFilename(doc.title || currentFileBase, DEFAULT_MODEL_NAME)}.json`;
    downloadText(writeFrameJson(doc), fileName, 'application/json;charset=utf-8');
    history.markSaved();
    context.recovery().flush();
    updateDirtyUi();
    updateStatus(
      localText(
        'JSONのダウンロードを開始しました。復旧データも保持します。',
        'JSON download started; recovery was retained.',
      ),
    );
  }

  async function exportYaml(): Promise<void> {
    const revision = doc.revision;
    const validation = validateFrameDocument(doc);
    if (validation.errorCount) {
      showValidationPanel();
      return;
    }
    const { exportFrameAnalysisYaml } = await import('../io/FrameAnalysisYaml');
    const result = exportFrameAnalysisYaml(doc);
    lastImportDiagnostics = result.diagnostics.map((item) => ({
      level: item.level,
      code: item.code,
      message: item.message,
      target: item.tag == null ? undefined : { kind: item.entityType ?? 'document', number: item.tag },
    }));
    if (lastImportDiagnostics.some((item) => item.level !== 'info')) {
      const content = createElement('div');
      content.append(diagnosticDownloads(lastImportDiagnostics));
      for (const item of lastImportDiagnostics)
        content.append(createElement('p', `diagnostic-item ${item.level}`, `[${item.code}] ${item.message}`));
      if (
        !(await dialogService.confirm({
          title: localText('YAML出力の影響を確認', 'Review YAML export'),
          body: content,
          confirmLabel: localText('出力', 'Export'),
          cancelLabel: t('dialog.cancel'),
        }))
      )
        return;
    }
    if (revision !== doc.revision) return;
    const fileName = `${safeFilename(doc.title || currentFileBase, DEFAULT_MODEL_NAME)}.yaml`;
    downloadText(result.yaml, fileName, 'application/yaml;charset=utf-8');
    updateStatus(t('status.yamlExported'));
    if (lastImportDiagnostics.some((item) => item.level !== 'info')) showImportReport();
  }

  function exportCurrentGridCsv(): void {
    const currentGrid = context.grid();
    const activeTab = context.tab();
    if (!currentGrid) return;
    const columns = currentGrid.getColumns();
    const records = currentGrid.getData().map((row) => {
      const record: Record<string, unknown> = {};
      for (const column of columns) record[column.key] = row[column.key];
      return record;
    });
    const csv = recordsToCsv(
      records,
      columns.map((column) => column.key),
    );
    downloadText(
      csv,
      `${safeFilename(doc.title || currentFileBase, DEFAULT_MODEL_NAME)}-${activeTab}.csv`,
      'text/csv;charset=utf-8',
    );
    updateStatus(t('status.csvExported'));
  }

  async function loadSample(): Promise<void> {
    if (!(await confirmDiscardChanges())) return;
    const request = ++importRequest;
    imports.cancel();
    const revision = doc.revision;
    const response = await fetch('./samples/FrameModel_Sample.json');
    if (!response.ok) throw new Error(`Sample request failed: ${response.status}`);
    const text = await response.text();
    if (revision !== doc.revision || request !== importRequest) return;
    await loadModelFile(new File([text], 'FrameModel_Sample.json', { type: 'application/json' }));
  }

  function showImportReport(): void {
    const content = createElement('div', 'diagnostic-list');
    content.append(diagnosticDownloads(lastImportDiagnostics));
    if (lastImportDiagnostics.length === 0)
      content.appendChild(createElement('p', undefined, t('diagnostic.none')));
    for (const diagnostic of lastImportDiagnostics) {
      content.appendChild(
        createButton(
          `[${diagnostic.code}] ${diagnostic.message}`,
          () => diagnostic.target && selectDiagnosticTarget(diagnostic.target.kind, diagnostic.target.number),
          `diagnostic-item ${diagnostic.level}`,
        ),
      );
    }
    toolPanel.open(t('panel.importReport'), content);
  }

  return {
    createNewDocument,
    confirmDiscardChanges,
    openFilePicker,
    saveJson,
    exportYaml,
    exportCurrentGridCsv,
    loadSample,
    showImportReport,
  };
}
