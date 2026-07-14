import './styles/main.css';

import { DialogService } from './app/DialogService';
import {
  assertImportFileSize,
  downloadText,
  recordsToCsv,
  safeFilename,
} from './app/FileDownloads';
import { ToolPanel } from './app/ToolPanel';
import gridColumns from './data/gridColumns.json';
import { getLang, Lang, setLang, t } from './i18n';
import { parseFrameJson, writeFrameJson } from './io/FrameJson';
import {
  AnalysisResult,
  parseAnalysisResult,
} from './models/AnalysisResult';
import { BoundaryCondition } from './models/BoundaryCondition';
import { CMQLoad } from './models/CMQLoad';
import { FrameDocument, NumberedEntityKind } from './models/FrameDocument';
import { LoadCaseType } from './models/LoadCase';
import { Material } from './models/Material';
import { Member } from './models/Member';
import { MemberLoad } from './models/MemberLoad';
import { Node } from './models/Node';
import { NodeLoad } from './models/NodeLoad';
import { Section, SectionShape, SectionType } from './models/Section';
import { Spring } from './models/Spring';
import { Wall } from './models/Wall';
import { DocumentHistory } from './services/DocumentHistory';
import { calculateModelStatistics } from './services/ModelStatistics';
import {
  applySectionProperties,
  calculateSectionProperties,
  SectionPropertyInput,
} from './services/SectionProperties';
import {
  ColumnDef,
  DataGrid,
  DataGridChange,
  DataGridOptionLike,
} from './ui/DataGrid';
import { validateFrameDocument } from './validation/FrameValidator';
import {
  AnalysisResultSet,
  DrawingEvent,
  DrawingMode,
  ModelViewer,
  StandardView,
  ViewerLayers,
  ViewerSelection,
} from './viewer/ModelViewer';

const MERGE_NODE_THRESHOLD = 2;
const MIN_DATA_PANEL_WIDTH = 280;
const AUTOSAVE_KEY = 'framemodelmaker.autosave.v1';
const DEFAULT_MODEL_NAME = 'frame-model';

type GridColumnType = 'number' | 'text' | 'int';

interface GridColumnConfig {
  key: string;
  header?: string;
  width?: string;
  type?: GridColumnType;
  readOnly?: boolean;
}

interface UnifiedDiagnostic {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  target?: { kind: string; number?: number };
}

interface NodeLoadRow {
  nodeNumber: number;
  p1: number;
  p2: number;
  p3: number;
  m1: number;
  m2: number;
  m3: number;
}

interface CMQLoadRow {
  memberNumber: number;
  moy: number;
  moz: number;
  iMy: number;
  iMz: number;
  iQx: number;
  iQy: number;
  iQz: number;
  jMy: number;
  jMz: number;
  jQx: number;
  jQy: number;
  jQz: number;
}

interface MemberLoadRow {
  memberNumber: number;
  lengthMethod: number;
  type: number;
  direction: number;
  scale: number;
  loadCode: string;
  unitLoad: number;
  p1: number;
  p2: number;
  p3: number;
}

interface TabProvider {
  rows(): object[];
  add?(): object | null;
  remove?(rows: object[]): string | null;
  duplicate?(rows: object[]): object[];
  applyChanges?(change: DataGridChange<object>): void;
  selectionForRow?(row: object): ViewerSelection;
  indexForSelection?(rows: object[], selection: ViewerSelection): number;
  numberKind?: NumberedEntityKind;
}

interface DialogField {
  name: string;
  label: string;
  value?: string;
  type?: 'text' | 'number' | 'select' | 'textarea';
  options?: Array<{ value: string; label: string }>;
}

const GRID_COLUMNS = gridColumns as Record<string, GridColumnConfig[]>;
const doc = new FrameDocument();
const history = new DocumentHistory(doc, { maxEntries: 100 });

let viewer: ModelViewer;
let dialogService: DialogService;
let toolPanel: ToolPanel;
// A heterogeneous grid is intentional: each tab owns its row type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentGrid: DataGrid<any> | null = null;
let currentRows: object[] = [];
let activeTab = 'nodes';
let currentSelection: ViewerSelection = { kind: 'none' };
let lastImportDiagnostics: UnifiedDiagnostic[] = [];
let currentFileBase = DEFAULT_MODEL_NAME;
let autosaveTimer: number | undefined;
let helpPreviousFocus: HTMLElement | null = null;
let selectionSyncInProgress = false;
let resultSet: AnalysisResultSet | null = null;

const tabDefs = [
  { id: 'nodes', i18nKey: 'tab.nodes' },
  { id: 'boundaries', i18nKey: 'tab.boundaries' },
  { id: 'materials', i18nKey: 'tab.materials' },
  { id: 'sections', i18nKey: 'tab.sections' },
  { id: 'springs', i18nKey: 'tab.springs' },
  { id: 'members', i18nKey: 'tab.members' },
  { id: 'walls', i18nKey: 'tab.walls' },
  { id: 'nodeloads', i18nKey: 'tab.nodeloads' },
  { id: 'cmqloads', i18nKey: 'tab.cmqloads' },
  { id: 'memberloads', i18nKey: 'tab.memberloads' },
] as const;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required UI element #${id} was not found.`);
  return element as T;
}

function localText(ja: string, en: string): string {
  return getLang() === 'ja' ? ja : en;
}

function nextNumber(items: ReadonlyArray<{ number: number }>, start = 1): number {
  return items.reduce((maximum, item) => Math.max(maximum, item.number), start - 1) + 1;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/\.?0+$/, '');
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createButton(label: string, action: () => void | Promise<void>, className = 'panel-action'): HTMLButtonElement {
  const button = createElement('button', className, label);
  button.type = 'button';
  button.addEventListener('click', () => {
    Promise.resolve(action()).catch(reportError);
  });
  return button;
}

function setPressed(id: string, pressed: boolean): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.toggle('active', pressed);
  element.setAttribute('aria-pressed', String(pressed));
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  updateStatus(localText(`エラー: ${message}`, `Error: ${message}`));
}

function on(id: string, handler: () => void | Promise<void>): void {
  const element = document.getElementById(id);
  element?.addEventListener('click', () => {
    Promise.resolve(handler()).catch(reportError);
    element.closest('details')?.removeAttribute('open');
  });
}

function initialize(): void {
  dialogService = new DialogService();
  toolPanel = new ToolPanel();
  setupViewer();
  setupMenu();
  setupTabs();
  setupGridToolbar();
  setupViewerToolbar();
  setupSelectionPanel();
  setupResizer();
  setupTheme();
  setupLanguage();
  setupHelp();
  setupKeyboardShortcuts();
  setupDocumentLifecycle();
  applyI18n();
  restoreAutosave();
  updateLoadCaseSelector();
  showTab('nodes');
  refreshDocumentUi(true);
  if (!history.isDirty) updateStatus(t('status.ready'));
}

function applyI18n(): void {
  document.documentElement.lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(element => {
    const key = element.dataset.i18nTitle;
    if (!key) return;
    const title = t(key);
    element.title = title;
    element.setAttribute('aria-label', title);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(element => {
    const key = element.dataset.i18nAria;
    if (key) element.setAttribute('aria-label', t(key));
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach(element => {
    const key = element.dataset.i18nPlaceholder;
    if (key) element.placeholder = t(key);
  });
  document.querySelectorAll<HTMLElement>('#tab-bar .tab').forEach(element => {
    const definition = tabDefs.find(tab => tab.id === element.dataset.tabId);
    if (definition) element.textContent = t(definition.i18nKey);
  });
  const dark = document.documentElement.dataset.theme === 'dark';
  byId<HTMLButtonElement>('btn-theme').textContent = dark ? t('theme.light') : t('theme.dark');
  byId<HTMLButtonElement>('btn-lang').textContent = getLang() === 'ja' ? 'EN' : 'JA';
  byId('help-title').textContent = t('help.title');
  byId<HTMLButtonElement>('selection-info-close').title = t('selection.close');
  updateLoadCaseSelector();
  updateToolbarVisibility();
  if (currentGrid) refreshGrid();
  renderSelectionInfo(currentSelection);
  updateModelSummary();
  viewer.setAccessibleLabel(localText(
    '対話型構造モデルビュー。矢印キーでカーソルを動かし、Enterで選択または作図します。',
    'Interactive structural model view. Move the cursor with arrow keys and press Enter to select or draw.',
  ));
  updateDrawingHint();
  updateViewerToggleStates();
}

function setupTheme(): void {
  const saved = localStorage.getItem('theme');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = saved === 'dark' || (saved == null && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  viewer.setTheme(dark);
  on('btn-theme', () => {
    const nextDark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
    localStorage.setItem('theme', nextDark ? 'dark' : 'light');
    viewer.setTheme(nextDark);
    applyI18n();
  });
}

function setupLanguage(): void {
  on('btn-lang', () => {
    toolPanel.close();
    const language: Lang = getLang() === 'ja' ? 'en' : 'ja';
    setLang(language);
    applyI18n();
    updateStatus(t('status.ready'));
    byId<HTMLButtonElement>('btn-lang').focus();
  });
}

function setupHelp(): void {
  const overlay = byId('help-overlay');
  const helpDialog = byId('help-dialog');
  const close = (): void => {
    overlay.classList.add('hidden');
    helpPreviousFocus?.focus();
    helpPreviousFocus = null;
  };
  on('btn-help', () => {
    helpPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    byId('help-body').innerHTML = t('help.content');
    byId('help-title').textContent = t('help.title');
    overlay.classList.remove('hidden');
    byId<HTMLButtonElement>('help-close').focus();
  });
  on('help-close', close);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  helpDialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...helpDialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

function setupMenu(): void {
  on('menu-new', createNewDocument);
  on('menu-open', openFilePicker);
  on('menu-save', saveJson);
  on('menu-export-yaml', exportYaml);
  on('menu-export-csv', exportCurrentGridCsv);
  on('menu-sample', loadSample);

  on('menu-fit', () => viewer.fitToView());
  on('menu-view-top', () => setStandardView('top'));
  on('menu-view-front', () => setStandardView('front'));
  on('menu-view-side', () => setStandardView('side'));
  on('menu-view-iso', () => setStandardView('isometric'));
  on('menu-projection', toggleProjection);
  on('menu-show-node-num', () => {
    viewer.showNodeNumbers = !viewer.showNodeNumbers;
    updateViewerToggleStates();
    updateStatus(t(viewer.showNodeNumbers ? 'status.nodeNumOn' : 'status.nodeNumOff'));
  });
  on('menu-show-member-num', () => {
    viewer.showMemberNumbers = !viewer.showMemberNumbers;
    updateViewerToggleStates();
    updateStatus(t(viewer.showMemberNumbers ? 'status.memberNumOn' : 'status.memberNumOff'));
  });
  on('menu-show-wall-num', () => {
    viewer.showWallNumbers = !viewer.showWallNumbers;
    updateViewerToggleStates();
    updateStatus(localText(
      `壁番号: ${viewer.showWallNumbers ? '表示' : '非表示'}`,
      `Wall numbers: ${viewer.showWallNumbers ? 'on' : 'off'}`,
    ));
  });
  on('menu-toggle-loads', toggleLoads);
  on('menu-toggle-boundaries', () => {
    const layers = viewer.getLayerVisibility();
    viewer.setLayerVisibility({ boundaries: !layers.boundaries });
    updateViewerToggleStates();
  });

  on('menu-undo', undo);
  on('menu-redo', redo);
  on('menu-sort', () => mutateDocument('Sort', () => doc.sort()));
  on('menu-renumber', () => {
    mutateDocument('Renumber', () => doc.assignNumbers());
    resetViewerSelection();
  });
  on('menu-merge', mergeOverlappingNodesWithPreview);
  on('menu-duplicate', duplicateSelectedRows);

  on('menu-add-loadcase', addLoadCase);
  on('menu-copy-loadcase', duplicateLoadCase);
  on('menu-remove-loadcase', removeLoadCase);
  on('menu-load-combinations', showLoadCombinationPanel);

  on('menu-validate', showValidationPanel);
  on('menu-model-info', showModelInfoPanel);
  on('menu-section-calculator', showSectionCalculator);
  on('menu-import-report', showImportReport);
  on('menu-results', showResultsPanel);
}

async function mergeOverlappingNodesWithPreview(): Promise<void> {
  const values = await requestFields(localText('近接節点を統合', 'Merge nearby nodes'), [{
    name: 'threshold',
    label: localText('統合距離（cm）', 'Merge distance (cm)'),
    value: String(MERGE_NODE_THRESHOLD),
    type: 'number',
  }]);
  if (!values) return;
  const threshold = Number(values.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error(localText('統合距離は0以上の有限値を指定してください。', 'Merge distance must be a finite non-negative value.'));
  }
  const previewDocument = new FrameDocument();
  parseFrameJson(writeFrameJson(doc), previewDocument, { mode: 'strict' });
  const preview = previewDocument.mergeOverlappingNodes(threshold);
  if (preview.mergedNodeCount === 0) {
    updateStatus(localText('統合対象の節点はありません。', 'No nodes are within the merge distance.'));
    return;
  }
  const confirmed = await dialogService.confirm({
    title: localText('節点統合の確認', 'Confirm node merge'),
    body: localText(
      `${preview.mergedNodeCount}節点を統合し、${preview.removedMemberNumbers.length}部材と縮退する壁${preview.degenerateWallNumbers.length}件を除去します。属性競合 ${preview.conflicts.length}件です。Undoできます。`,
      `This will merge ${preview.mergedNodeCount} nodes and remove ${preview.removedMemberNumbers.length} members plus ${preview.degenerateWallNumbers.length} walls that would degenerate. Attribute conflicts: ${preview.conflicts.length}. This can be undone.`,
    ),
    confirmLabel: localText('統合する', 'Merge'),
    cancelLabel: t('dialog.cancel'),
    destructive: preview.removedMemberNumbers.length > 0 || preview.degenerateWallNumbers.length > 0,
  });
  if (!confirmed) return;
  const result = mutateDocument('Merge overlapping nodes', () => {
    const merged = doc.mergeOverlappingNodes(threshold);
    const removedWallNumbers = new Set(merged.degenerateWallNumbers);
    doc.walls = doc.walls.filter(wall => !removedWallNumbers.has(wall.number));
    return merged;
  });
  resetViewerSelection();
    updateStatus(localText(
      `${result.mergedNodeCount}節点を統合、${result.removedMemberNumbers.length}部材と${result.degenerateWallNumbers.length}壁を除去しました`,
      `Merged ${result.mergedNodeCount} nodes; removed ${result.removedMemberNumbers.length} members and ${result.degenerateWallNumbers.length} walls`,
    ));
}

async function createNewDocument(): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  doc.init();
  history.reset(true);
  history.clearAutosave(localStorage, AUTOSAVE_KEY);
  currentFileBase = DEFAULT_MODEL_NAME;
  lastImportDiagnostics = [];
  resultSet = null;
  viewer.setAnalysisResults(null);
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
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void loadModelFile(file).catch(reportError);
  }, { once: true });
  input.click();
}

async function loadModelFile(file: File): Promise<void> {
  assertImportFileSize(file);
  const text = await file.text();
  const incoming = new FrameDocument();
  const lowerName = file.name.toLowerCase();
  const diagnostics: UnifiedDiagnostic[] = [];
  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml')) {
    const { parseFrameAnalysisYaml } = await import('./io/FrameAnalysisYaml');
    const result = parseFrameAnalysisYaml(text, incoming);
    diagnostics.push(...result.diagnostics.map(item => ({
      level: item.level,
      code: item.code,
      message: item.message,
      target: item.tag == null ? undefined : {
        kind: item.entityType ?? 'document',
        number: item.tag,
      },
    })));
  } else {
    const result = parseFrameJson(text, incoming, { mode: 'strict' });
    diagnostics.push(...result.diagnostics.map(item => ({
      level: item.level === 'warning' ? 'warn' as const : 'info' as const,
      code: item.code,
      message: `${item.path}: ${item.message}`,
    })));
  }
  if (!replaceDocument(incoming, file.name, diagnostics)) return;
  updateStatus(t('status.fileLoaded', file.name, doc.nodes.length, doc.members.length));
}

function replaceDocument(incoming: FrameDocument, fileName: string, diagnostics: UnifiedDiagnostic[]): boolean {
  const validation = validateFrameDocument(incoming);
  diagnostics.push(...validation.diagnostics.map(item => ({
    level: item.severity === 'warning' ? 'warn' as const : item.severity,
    code: item.code,
    message: item.message,
    target: { kind: item.entity.kind, number: item.entity.number },
  })));
  if (validation.errorCount > 0) {
    lastImportDiagnostics = diagnostics;
    showImportReport();
    updateStatus(localText(
      `読込を中止しました。モデル検証エラー ${validation.errorCount}件（現在のモデルは変更されていません）`,
      `Import stopped with ${validation.errorCount} model validation errors; the current model was not changed.`,
    ));
    return false;
  }
  doc.replaceWith(incoming);
  history.reset(true);
  history.clearAutosave(localStorage, AUTOSAVE_KEY);
  currentFileBase = fileName.replace(/\.(?:json|ya?ml)$/i, '') || DEFAULT_MODEL_NAME;
  lastImportDiagnostics = diagnostics;
  resultSet = null;
  viewer.setAnalysisResults(null);
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
  history.clearAutosave(localStorage, AUTOSAVE_KEY);
  updateDirtyUi();
  updateStatus(t('status.fileSaved'));
}

async function exportYaml(): Promise<void> {
  const { exportFrameAnalysisYaml } = await import('./io/FrameAnalysisYaml');
  const result = exportFrameAnalysisYaml(doc);
  lastImportDiagnostics = result.diagnostics.map(item => ({
    level: item.level,
    code: item.code,
    message: item.message,
    target: item.tag == null ? undefined : { kind: item.entityType ?? 'document', number: item.tag },
  }));
  const fileName = `${safeFilename(doc.title || currentFileBase, DEFAULT_MODEL_NAME)}.yaml`;
  downloadText(result.yaml, fileName, 'application/yaml;charset=utf-8');
  updateStatus(t('status.yamlExported'));
  if (lastImportDiagnostics.some(item => item.level !== 'info')) showImportReport();
}

function exportCurrentGridCsv(): void {
  if (!currentGrid) return;
  const columns = currentGrid.getColumns();
  const records = currentGrid.getData().map(row => {
    const record: Record<string, unknown> = {};
    for (const column of columns) record[column.key] = row[column.key];
    return record;
  });
  const csv = recordsToCsv(records, columns.map(column => column.key));
  downloadText(csv, `${safeFilename(doc.title || currentFileBase, DEFAULT_MODEL_NAME)}-${activeTab}.csv`, 'text/csv;charset=utf-8');
  updateStatus(t('status.csvExported'));
}

async function loadSample(): Promise<void> {
  if (!(await confirmDiscardChanges())) return;
  const response = await fetch('./samples/FrameModel_Sample.json');
  if (!response.ok) throw new Error(`Sample request failed: ${response.status}`);
  const incoming = new FrameDocument();
  const result = parseFrameJson(await response.text(), incoming, { mode: 'strict' });
  if (!replaceDocument(incoming, 'FrameModel_Sample.json', result.diagnostics.map(item => ({
    level: item.level === 'warning' ? 'warn' : 'info',
    code: item.code,
    message: `${item.path}: ${item.message}`,
  })))) return;
  updateStatus(t('status.sampleLoaded', doc.nodes.length, doc.members.length));
}

function mutateDocument<T>(label: string, action: () => T, fitToView = false): T {
  let value!: T;
  history.runTransaction(label, () => {
    value = action();
    doc.synchronizeBoundaryConditions();
    doc.notifyChange();
  });
  const invalidatedResults = invalidateAnalysisResults();
  refreshDocumentUi(fitToView);
  scheduleAutosave();
  if (invalidatedResults) {
    updateStatus(localText(
      'モデルが変更されたため、読み込み済みの解析結果を破棄しました。',
      'Loaded analysis results were discarded because the model changed.',
    ));
  }
  return value;
}

function undo(): void {
  if (!history.undo()) return;
  const invalidatedResults = invalidateAnalysisResults();
  resetViewerSelection();
  refreshDocumentUi(false);
  scheduleAutosave();
  updateStatus(invalidatedResults
    ? localText('元に戻しました。解析結果は破棄しました。', 'Undone; loaded analysis results were discarded.')
    : t('status.undo'));
}

function redo(): void {
  if (!history.redo()) return;
  const invalidatedResults = invalidateAnalysisResults();
  resetViewerSelection();
  refreshDocumentUi(false);
  scheduleAutosave();
  updateStatus(invalidatedResults
    ? localText('やり直しました。解析結果は破棄しました。', 'Redone; loaded analysis results were discarded.')
    : t('status.redo'));
}

function scheduleAutosave(): void {
  window.clearTimeout(autosaveTimer);
  if (!history.isDirty) return;
  autosaveTimer = window.setTimeout(() => {
    try {
      history.saveAutosave(localStorage, AUTOSAVE_KEY);
    } catch (error) {
      console.warn('Autosave failed', error);
    }
  }, 350);
}

function restoreAutosave(): void {
  try {
    if (!history.restoreAutosaveFrom(localStorage, AUTOSAVE_KEY)) return;
    if (!history.isDirty) {
      history.clearAutosave(localStorage, AUTOSAVE_KEY);
      return;
    }
    updateStatus(t('status.autosaveRestored'));
  } catch (error) {
    console.warn('Ignoring invalid autosave', error);
    history.clearAutosave(localStorage, AUTOSAVE_KEY);
  }
}

function setupDocumentLifecycle(): void {
  window.addEventListener('beforeunload', event => {
    if (!history.isDirty) return;
    try {
      history.saveAutosave(localStorage, AUTOSAVE_KEY);
    } catch {
      // beforeunload must remain best-effort.
    }
    event.preventDefault();
    event.returnValue = '';
  });
}

function setupTabs(): void {
  const tabBar = byId('tab-bar');
  tabBar.replaceChildren();
  for (const definition of tabDefs) {
    const button = createElement('button', 'tab', t(definition.i18nKey));
    button.type = 'button';
    button.role = 'tab';
    button.dataset.tabId = definition.id;
    button.id = `tab-${definition.id}`;
    button.setAttribute('aria-controls', 'grid-container');
    button.addEventListener('click', () => showTab(definition.id));
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const index = tabDefs.findIndex(tab => tab.id === definition.id);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabDefs[(index + delta + tabDefs.length) % tabDefs.length];
      showTab(next.id);
      byId<HTMLButtonElement>(`tab-${next.id}`).focus();
    });
    tabBar.appendChild(button);
  }
}

function showTab(tabId: string, preserveSelection = false): void {
  if (!(tabId in tabProviders)) return;
  activeTab = tabId;
  document.querySelectorAll<HTMLElement>('#tab-bar .tab').forEach(tab => {
    const active = tab.dataset.tabId === tabId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  byId('grid-container').setAttribute('aria-labelledby', `tab-${tabId}`);
  updateToolbarVisibility();
  refreshGrid();
  if (preserveSelection) syncGridToViewerSelection(currentSelection);
}

function setupGridToolbar(): void {
  const group = createElement('div');
  group.id = 'toolbar-buttons';
  const add = createButton(`+ ${t('toolbar.addRow')}`, addRow, 'toolbar-btn');
  add.id = 'btn-add-row';
  const remove = createButton(`− ${t('toolbar.deleteRow')}`, deleteSelectedRows, 'toolbar-btn toolbar-btn-danger');
  remove.id = 'btn-delete-row';
  const changeNumber = createButton(t('toolbar.changeNumber'), changeSelectedNumber, 'toolbar-btn secondary');
  changeNumber.id = 'btn-change-number';
  group.append(add, remove, changeNumber);
  byId('grid-toolbar').appendChild(group);

  byId<HTMLInputElement>('grid-search').addEventListener('input', event => {
    currentGrid?.setSearchQuery((event.currentTarget as HTMLInputElement).value);
  });
  on('btn-copy-grid', async () => {
    if (!currentGrid) return;
    const text = currentGrid.copySelection();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    updateStatus(localText('選択範囲をコピーしました', 'Selection copied'));
  });
  on('btn-paste-grid', async () => {
    if (!currentGrid) return;
    const text = await navigator.clipboard.readText();
    const result = currentGrid.pasteTSV(text);
    updateStatus(localText(
      `${result.appliedCellCount}セルを貼り付けました`,
      `Pasted ${result.appliedCellCount} cells`,
    ));
  });
}

function updateToolbarVisibility(): void {
  const provider = tabProviders[activeTab];
  const add = document.getElementById('btn-add-row');
  const remove = document.getElementById('btn-delete-row');
  const renumber = document.getElementById('btn-change-number');
  if (add) add.classList.toggle('hidden', !provider?.add);
  if (remove) remove.classList.toggle('hidden', !provider?.remove);
  if (renumber) renumber.classList.toggle('hidden', !provider?.numberKind);
  if (add) add.textContent = `+ ${t('toolbar.addRow')}`;
  if (remove) remove.textContent = `− ${t('toolbar.deleteRow')}`;
  if (renumber) renumber.textContent = t('toolbar.changeNumber');
}

function refreshGrid(): void {
  const container = byId('grid-container');
  currentGrid?.destroy();
  container.replaceChildren();
  currentGrid = null;
  currentRows = [];
  const provider = tabProviders[activeTab];
  if (!provider) return;
  currentRows = provider.rows();
  const columns = getColumnsFromConfig<object>(activeTab);
  const grid = new DataGrid<object>(container, columns, currentRows, { selectionMode: 'multiple' });
  grid.setOnDataChanged(change => {
    provider.applyChanges?.(change);
    doc.synchronizeBoundaryConditions();
    doc.notifyChange();
    const invalidatedResults = invalidateAnalysisResults();
    viewer.updateModel(false);
    renderSelectionInfo(currentSelection);
    updateModelSummary();
    updateDirtyUi();
    scheduleAutosave();
    if (invalidatedResults) {
      updateStatus(localText(
        'モデルが変更されたため、読み込み済みの解析結果を破棄しました。',
        'Loaded analysis results were discarded because the model changed.',
      ));
    }
  });
  grid.setOnSelectionChanged(change => {
    updateToolbarSelectionState(change.selectedRows.length);
    if (selectionSyncInProgress || change.selectedRows.length === 0) return;
    const activeRow = change.activeRowIndex == null
      ? change.selectedRows[change.selectedRows.length - 1]
      : currentRows[change.activeRowIndex];
    const selection = activeRow ? provider.selectionForRow?.(activeRow) : undefined;
    if (!selection) return;
    selectionSyncInProgress = true;
    currentSelection = selection;
    viewer.setSelection(selection, false);
    renderSelectionInfo(selection);
    selectionSyncInProgress = false;
  });
  const search = byId<HTMLInputElement>('grid-search').value;
  if (search) grid.setSearchQuery(search);
  currentGrid = grid;
  syncGridToViewerSelection(currentSelection);
}

function updateToolbarSelectionState(selectedCount: number): void {
  const remove = document.getElementById('btn-delete-row') as HTMLButtonElement | null;
  const changeNumber = document.getElementById('btn-change-number') as HTMLButtonElement | null;
  if (remove) remove.disabled = selectedCount === 0;
  if (changeNumber) changeNumber.disabled = selectedCount !== 1;
}

function getColumnsFromConfig<T extends object>(tabId: string): ColumnDef<T>[] {
  return (GRID_COLUMNS[tabId] ?? []).map(configuration => {
    const column: ColumnDef<T> = {
      key: configuration.key as keyof T & string,
      header: columnHeader(tabId, configuration.key),
      width: configuration.width,
      type: configuration.type,
      readOnly: configuration.readOnly,
      searchable: true,
    };
    configureTypedColumn(tabId, column);
    return column;
  });
}

function columnHeader(tabId: string, key: string): string {
  const special: Record<string, string> = {
    nodeNumber: t('col.nodeNumber'),
    memberNumber: t('col.memberNumber'),
    x: t('col.xCoord'),
    y: t('col.yCoord'),
    z: t('col.zCoord'),
    temperature: t('col.temperature'),
    intensityGroup: t('col.intensityGroup'),
    longWeight: t('col.longWeight'),
    forceWeight: t('col.forceWeight'),
    addForceWeight: t('col.addForceWeight'),
    area: t('col.area'),
    deltaX: t('col.deltaX'),
    deltaY: t('col.deltaY'),
    deltaZ: t('col.deltaZ'),
    thetaX: t('col.thetaX'),
    thetaY: t('col.thetaY'),
    thetaZ: t('col.thetaZ'),
    young: t('col.young'),
    shear: t('col.shear'),
    expansion: t('col.expansion'),
    poisson: t('col.poisson'),
    unitLoad: t('col.unitLoad'),
    name: t('col.materialName'),
    materialNumber: t('col.material'),
    type: t('col.type'),
    shape: t('col.shape'),
    comment: t('col.comment'),
    method: t('col.method'),
    iNodeNumber: t('col.iNode'),
    jNodeNumber: t('col.jNode'),
    sectionNumber: t('col.section'),
    leftBottomNode: t('col.leftBottom'),
    rightBottomNode: t('col.rightBottom'),
    leftTopNode: t('col.leftTop'),
    rightTopNode: t('col.rightTop'),
    lengthMethod: t('col.lengthMethod'),
    direction: t('col.direction'),
    scale: t('col.scale'),
    loadCode: t('col.code'),
    p1_A: 'A',
    p2_Ix: 'Ix (legacy J)',
    torsionConstant: 'J',
    p3_Iy: 'Iy',
    p4_Iz: 'Iz',
    kTheta: 'Kθ',
  };
  if (key === 'number') {
    if (tabId === 'nodes') return t('col.nodeNumber');
    if (tabId === 'members') return t('col.memberNumber');
    if (tabId === 'walls') return t('col.wallNumber');
    return t('col.number');
  }
  if (['p1', 'p2', 'p3'].includes(key) && tabId === 'nodeloads') return t(`col.${key}kN`);
  return special[key] ?? key;
}

function option(value: string | number | boolean, label: string): DataGridOptionLike {
  return { value, label };
}

function configureTypedColumn<T extends object>(tabId: string, column: ColumnDef<T>): void {
  const key = column.key as string;
  const numberedTabs = new Set(['nodes', 'materials', 'sections', 'springs', 'members', 'walls']);
  if (key === 'number' && numberedTabs.has(tabId)) column.readOnly = true;

  const nodeReferenceKeys = new Set([
    'nodeNumber', 'iNodeNumber', 'jNodeNumber',
    'leftBottomNode', 'rightBottomNode', 'leftTopNode', 'rightTopNode',
  ]);
  if (nodeReferenceKeys.has(key) && tabId !== 'nodeloads') {
    column.type = 'reference';
    column.referenceOptions = () => doc.nodes.map(node => option(node.number, String(node.number)));
    column.required = true;
  }
  if (key === 'materialNumber') {
    column.type = 'reference';
    column.referenceOptions = () => [
      option(0, localText('0: 未指定', '0: None')),
      ...doc.materials.map(material => option(material.number, `${material.number}: ${material.name || '-'}`)),
    ];
  }
  if (key === 'sectionNumber') {
    column.type = 'reference';
    column.referenceOptions = () => doc.sections.map(section => option(section.number, `${section.number}: ${section.comment || '-'}`));
  }
  if (/^[ij][xyz]Spring$/.test(key)) {
    column.type = 'reference';
    column.referenceOptions = () => [
      option(0, localText('0: 連続', '0: Continuous')),
      option(1, localText('1: 剛', '1: Rigid')),
      option(2, localText('2: ピン', '2: Pin')),
      ...doc.springs.map(spring => option(spring.number, `${spring.number}: Kθ=${spring.kTheta}`)),
    ];
  }
  if (tabId === 'boundaries' && ['deltaX', 'deltaY', 'deltaZ', 'thetaX', 'thetaY', 'thetaZ'].includes(key)) {
    column.type = 'enum';
    column.enumOptions = [option(0, localText('自由', 'Free')), option(1, localText('拘束', 'Fixed'))];
  }
  if (tabId === 'sections' && key === 'type') {
    column.type = 'enum';
    column.enumOptions = [
      option(SectionType.Horizontal, localText('水平', 'Horizontal')),
      option(SectionType.Vertical, localText('鉛直', 'Vertical')),
      option(SectionType.Diagonal, localText('斜材', 'Diagonal')),
      option(SectionType.Other, localText('その他', 'Other')),
      option(SectionType.Truss, localText('トラス', 'Truss')),
      option(SectionType.Wall, localText('壁', 'Wall')),
    ];
  }
  if (tabId === 'sections' && key === 'shape') {
    column.type = 'enum';
    column.enumOptions = [
      option(SectionShape.DirectInput, localText('直接入力', 'Direct')),
      option(SectionShape.Rectangle, localText('矩形', 'Rectangle')),
      option(SectionShape.Circle, localText('円形', 'Circle')),
      option(SectionShape.Steel, localText('鋼材', 'Steel')),
      option(SectionShape.Box, localText('箱形', 'Box')),
      option(SectionShape.I_Steel, 'I'),
      option(SectionShape.H_Steel, 'H'),
    ];
  }
  if (tabId === 'memberloads' && ['lengthMethod', 'type', 'direction'].includes(key)) {
    column.type = 'enum';
    column.enumOptions = [0, 1, 2, 3].map(value => option(value, String(value)));
  }
  if (tabId === 'springs' && key === 'method') {
    column.type = 'enum';
    column.enumOptions = [option(0, '0'), option(1, '1')];
  }
  if (['p1_A', 'p2_Ix', 'torsionConstant', 'p3_Iy', 'p4_Iz', 'ky', 'kz', 'young', 'shear', 'unitLoad', 'kTheta', 'area'].includes(key)) {
    column.min = 0;
  }
  if (key === 'poisson') {
    column.min = -0.999;
    column.max = 0.499;
  }
  if (column.type === 'number' || column.type === 'int') {
    column.required = true;
    column.validate = context => Number.isFinite(Number(context.value))
      ? null
      : localText('有限の数値を入力してください', 'Enter a finite number');
  }
  if (tabId === 'members' && (key === 'iNodeNumber' || key === 'jNodeNumber')) {
    column.validate = context => {
      const row = context.row as unknown as Member;
      const other = key === 'iNodeNumber' ? row.jNodeNumber : row.iNodeNumber;
      return Number(context.value) === other
        ? localText('I端とJ端には異なる節点が必要です', 'I and J ends must use different nodes')
        : null;
    };
  }
}

function removeByIdentity<T>(list: T[], selected: ReadonlyArray<T>): void {
  const selectedSet = new Set(selected);
  for (let index = list.length - 1; index >= 0; index--) {
    if (selectedSet.has(list[index])) list.splice(index, 1);
  }
}

function ensureDefaultSection(): Section {
  const existing = doc.sections[0];
  if (existing) return existing;
  const section = new Section();
  section.number = 1;
  section.type = SectionType.Other;
  section.shape = SectionShape.DirectInput;
  section.p1_A = 1;
  section.p2_Ix = 1;
  section.torsionConstant = 1;
  section.p3_Iy = 1;
  section.p4_Iz = 1;
  section.ky = 1;
  section.kz = 1;
  section.comment = localText('仮断面（要編集）', 'Placeholder section (edit required)');
  doc.sections.push(section);
  return section;
}

function numberSelection(kind: 'node' | 'member' | 'wall', number: number): ViewerSelection {
  if (kind === 'node') return { kind, nodeNumber: number };
  if (kind === 'member') return { kind, memberNumber: number };
  return { kind, wallNumber: number };
}

function entityProvider<T extends { number: number }>(configuration: {
  list: () => T[];
  add: () => T | null;
  kind: 'node' | 'member' | 'wall' | null;
  numberKind: NumberedEntityKind;
  dependencyError?: (selected: T[]) => string | null;
  duplicate: (selected: T[]) => T[];
}): TabProvider {
  return {
    rows: configuration.list,
    add: configuration.add,
    remove: rows => {
      const selected = rows as T[];
      const error = configuration.dependencyError?.(selected) ?? null;
      if (error) return error;
      removeByIdentity(configuration.list(), selected);
      return null;
    },
    duplicate: rows => configuration.duplicate(rows as T[]),
    numberKind: configuration.numberKind,
    selectionForRow: configuration.kind
      ? row => numberSelection(configuration.kind!, (row as T).number)
      : undefined,
    indexForSelection: configuration.kind
      ? (rows, selection) => rows.findIndex(row => {
        const item = row as T;
        return selection.kind === configuration.kind
          && item.number === (selection.kind === 'node'
            ? selection.nodeNumber
            : selection.kind === 'member'
              ? selection.memberNumber
              : selection.wallNumber);
      })
      : undefined,
  };
}

function cloneNode(source: Node): Node {
  const clone = doc.createNode(source.x, source.y, source.z);
  Object.assign(clone, source);
  clone.number = doc.newNodeNumber;
  clone.loads = source.loads.map(load => Object.assign(new NodeLoad(), load));
  clone.boundaryCondition = null;
  clone.selected = false;
  doc.addNode(clone);
  const metadata = doc.analysisMetadata;
  if (metadata) {
    for (const mass of metadata.nodalMasses.filter(item => item.nodeTag === source.number)) {
      metadata.nodalMasses.push({ ...cloneJsonData(mass), nodeTag: clone.number });
    }
    for (const group of metadata.groups) {
      if (group.nodeTags.includes(source.number) && !group.nodeTags.includes(clone.number)) {
        group.nodeTags.push(clone.number);
      }
    }
  }
  return clone;
}

function cloneMember(source: Member): Member {
  const clone = doc.createMember();
  Object.assign(clone, source);
  clone.number = doc.newMemberNumber;
  const metadata = doc.analysisMetadata;
  if (metadata) {
    const reservedTags = new Set([
      ...metadata.linkElements.map(link => link.tag),
      ...Object.keys(metadata.localAxes).map(Number).filter(Number.isFinite),
    ]);
    while (reservedTags.has(clone.number)) clone.number++;
  }
  clone.memberLoads = source.memberLoads.map(load => Object.assign(new MemberLoad(), load));
  clone.cmqLoads = source.cmqLoads.map(load => Object.assign(new CMQLoad(), load));
  clone.selected = false;
  doc.addMember(clone);
  if (metadata) {
    const axis = metadata.localAxes[String(source.number)];
    if (axis) metadata.localAxes[String(clone.number)] = cloneJsonData(axis);
    for (const link of metadata.linkElements.filter(item => item.tag === source.number)) {
      metadata.linkElements.push({ ...cloneJsonData(link), tag: clone.number });
    }
    for (const group of metadata.groups) {
      if (group.elementTags.includes(source.number) && !group.elementTags.includes(clone.number)) {
        group.elementTags.push(clone.number);
      }
    }
  }
  return clone;
}

function cloneJsonData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadRows(): NodeLoadRow[] {
  return doc.nodes.map(node => {
    const load = node.getLoad(doc.loadCaseIndex);
    return {
      nodeNumber: node.number,
      p1: load.p1,
      p2: load.p2,
      p3: load.p3,
      m1: load.m1,
      m2: load.m2,
      m3: load.m3,
    };
  });
}

function cmqRows(): CMQLoadRow[] {
  return doc.members.map(member => {
    const load = member.getCMQLoad(doc.loadCaseIndex);
    return {
      memberNumber: member.number,
      moy: load.moy,
      moz: load.moz,
      iMy: load.iMy,
      iMz: load.iMz,
      iQx: load.iQx,
      iQy: load.iQy,
      iQz: load.iQz,
      jMy: load.jMy,
      jMz: load.jMz,
      jQx: load.jQx,
      jQy: load.jQy,
      jQz: load.jQz,
    };
  });
}

function memberLoadRows(): MemberLoadRow[] {
  return doc.members.map(member => {
    const load = member.getMemberLoad(doc.loadCaseIndex);
    return {
      memberNumber: member.number,
      lengthMethod: load.lengthMethod,
      type: load.type,
      direction: load.direction,
      scale: load.scale,
      loadCode: load.loadCode,
      unitLoad: load.unitLoad,
      p1: load.p1,
      p2: load.p2,
      p3: load.p3,
    };
  });
}

function applyLoadChanges<T extends { nodeNumber?: number; memberNumber?: number }>(
  change: DataGridChange<object>,
  resolve: (row: T) => object | undefined,
): void {
  for (const cell of change.changes) {
    const row = cell.row as T;
    const target = resolve(row) as Record<string, unknown> | undefined;
    if (target) target[cell.columnKey as string] = cell.value;
  }
}

const tabProviders: Record<string, TabProvider> = {
  nodes: entityProvider<Node>({
    list: () => doc.nodes,
    add: () => doc.addNode(),
    kind: 'node',
    numberKind: 'node',
    dependencyError: selected => {
      const numbers = new Set(selected.map(node => node.number));
      const member = doc.members.find(item => numbers.has(item.iNodeNumber) || numbers.has(item.jNodeNumber));
      const wall = doc.walls.find(item => [item.leftBottomNode, item.rightBottomNode, item.leftTopNode, item.rightTopNode].some(number => numbers.has(number)));
      const boundary = doc.boundaries.find(item => numbers.has(item.nodeNumber));
      const metadata = doc.analysisMetadata;
      const metadataReference = metadata && (
        metadata.constraints.some(item => numbers.has(item.retainedNode) || numbers.has(item.constrainedNode))
        || metadata.nodalMasses.some(item => numbers.has(item.nodeTag))
        || metadata.linkElements.some(item => numbers.has(item.nodeI) || numbers.has(item.nodeJ))
        || metadata.groups.some(item => item.nodeTags.some(number => numbers.has(number)))
      );
      if (!member && !wall && !boundary && !metadataReference) return null;
      return localText(
        '部材・壁・境界条件・解析メタデータから参照されている節点は削除できません。先に参照元を削除してください。',
        'Referenced nodes cannot be deleted. Remove members, walls, boundaries, and analysis metadata first.',
      );
    },
    duplicate: selected => selected.map(cloneNode),
  }),
  boundaries: {
    rows: () => doc.boundaries,
    add: () => {
      const used = new Set(doc.boundaries.map(boundary => boundary.nodeNumber));
      const node = doc.nodes.find(item => !used.has(item.number));
      if (!node) return null;
      const boundary = new BoundaryCondition();
      boundary.nodeNumber = node.number;
      doc.boundaries.push(boundary);
      return boundary;
    },
    remove: rows => {
      removeByIdentity(doc.boundaries, rows as BoundaryCondition[]);
      return null;
    },
    duplicate: () => [],
    selectionForRow: row => ({ kind: 'node', nodeNumber: (row as BoundaryCondition).nodeNumber }),
    indexForSelection: (rows, selection) => selection.kind === 'node'
      ? rows.findIndex(row => (row as BoundaryCondition).nodeNumber === selection.nodeNumber)
      : -1,
  },
  materials: entityProvider<Material>({
    list: () => doc.materials,
    add: () => {
      const material = new Material();
      material.number = nextNumber(doc.materials);
      material.name = localText('新規材料', 'New material');
      doc.materials.push(material);
      return material;
    },
    kind: null,
    numberKind: 'material',
    dependencyError: selected => {
      const numbers = new Set(selected.map(item => item.number));
      return doc.sections.some(section => numbers.has(section.materialNumber)) || doc.walls.some(wall => numbers.has(wall.materialNumber))
        ? localText('断面または壁から参照されている材料は削除できません。', 'Materials referenced by sections or walls cannot be deleted.')
        : null;
    },
    duplicate: selected => selected.map(source => {
      const clone = Object.assign(new Material(), source);
      clone.number = nextNumber(doc.materials);
      clone.name = `${source.name} Copy`;
      doc.materials.push(clone);
      return clone;
    }),
  }),
  sections: entityProvider<Section>({
    list: () => doc.sections,
    add: () => {
      if (doc.sections.length === 0) return ensureDefaultSection();
      const section = new Section();
      section.number = nextNumber(doc.sections);
      section.materialNumber = doc.materials[0]?.number ?? 0;
      if (section.materialNumber === 0) section.type = SectionType.Other;
      doc.sections.push(section);
      return section;
    },
    kind: null,
    numberKind: 'section',
    dependencyError: selected => {
      const numbers = new Set(selected.map(item => item.number));
      return doc.members.some(member => numbers.has(member.sectionNumber))
        ? localText('部材から参照されている断面は削除できません。', 'Sections referenced by members cannot be deleted.')
        : null;
    },
    duplicate: selected => selected.map(source => {
      const clone = Object.assign(new Section(), source);
      clone.number = nextNumber(doc.sections);
      clone.comment = `${source.comment} Copy`.trim();
      doc.sections.push(clone);
      return clone;
    }),
  }),
  springs: entityProvider<Spring>({
    list: () => doc.springs,
    add: () => doc.addSpring(),
    kind: null,
    numberKind: 'spring',
    dependencyError: selected => {
      const numbers = new Set(selected.map(item => item.number));
      return doc.members.some(member => [member.ixSpring, member.iySpring, member.izSpring, member.jxSpring, member.jySpring, member.jzSpring].some(number => numbers.has(number)))
        ? localText('部材から参照されているバネは削除できません。', 'Springs referenced by members cannot be deleted.')
        : null;
    },
    duplicate: selected => selected.map(source => {
      const clone = Object.assign(doc.createSpring(), source);
      clone.number = doc.newSpringNumber;
      doc.addSpring(clone);
      return clone;
    }),
  }),
  members: entityProvider<Member>({
    list: () => doc.members,
    add: () => {
      if (doc.nodes.length < 2) return null;
      const member = doc.createMember();
      member.iNodeNumber = doc.nodes[0].number;
      member.jNodeNumber = doc.nodes[1].number;
      member.sectionNumber = ensureDefaultSection().number;
      return doc.addMember(member);
    },
    kind: 'member',
    numberKind: 'member',
    dependencyError: selected => {
      const numbers = new Set(selected.map(item => item.number));
      const metadata = doc.analysisMetadata;
      return metadata && (
        metadata.linkElements.some(item => numbers.has(item.tag))
        || metadata.groups.some(item => item.elementTags.some(number => numbers.has(number)))
      )
        ? localText('解析メタデータから参照されている部材は削除できません。', 'Members referenced by analysis metadata cannot be deleted.')
        : null;
    },
    duplicate: selected => selected.map(cloneMember),
  }),
  walls: entityProvider<Wall>({
    list: () => doc.walls,
    add: () => {
      if (doc.nodes.length < 4) return null;
      const wall = new Wall();
      wall.number = nextNumber(doc.walls);
      [wall.leftBottomNode, wall.rightBottomNode, wall.leftTopNode, wall.rightTopNode] = doc.nodes.slice(0, 4).map(node => node.number);
      wall.materialNumber = doc.materials[0]?.number ?? 0;
      doc.walls.push(wall);
      return wall;
    },
    kind: 'wall',
    numberKind: 'wall',
    duplicate: selected => selected.map(source => {
      const clone = Object.assign(new Wall(), source);
      clone.number = nextNumber(doc.walls);
      doc.walls.push(clone);
      return clone;
    }),
  }),
  nodeloads: {
    rows: loadRows,
    applyChanges: change => applyLoadChanges<NodeLoadRow>(change, row => doc.findNodeByNumber(row.nodeNumber)?.getLoad(doc.loadCaseIndex)),
    selectionForRow: row => ({ kind: 'node', nodeNumber: (row as NodeLoadRow).nodeNumber }),
    indexForSelection: (rows, selection) => selection.kind === 'node'
      ? rows.findIndex(row => (row as NodeLoadRow).nodeNumber === selection.nodeNumber)
      : -1,
  },
  cmqloads: {
    rows: cmqRows,
    applyChanges: change => applyLoadChanges<CMQLoadRow>(change, row => doc.members.find(member => member.number === row.memberNumber)?.getCMQLoad(doc.loadCaseIndex)),
    selectionForRow: row => ({ kind: 'member', memberNumber: (row as CMQLoadRow).memberNumber }),
    indexForSelection: (rows, selection) => selection.kind === 'member'
      ? rows.findIndex(row => (row as CMQLoadRow).memberNumber === selection.memberNumber)
      : -1,
  },
  memberloads: {
    rows: memberLoadRows,
    applyChanges: change => applyLoadChanges<MemberLoadRow>(change, row => doc.members.find(member => member.number === row.memberNumber)?.getMemberLoad(doc.loadCaseIndex)),
    selectionForRow: row => ({ kind: 'member', memberNumber: (row as MemberLoadRow).memberNumber }),
    indexForSelection: (rows, selection) => selection.kind === 'member'
      ? rows.findIndex(row => (row as MemberLoadRow).memberNumber === selection.memberNumber)
      : -1,
  },
};

function addRow(): void {
  const provider = tabProviders[activeTab];
  if (!provider?.add) return;
  const created = mutateDocument('Add row', provider.add);
  if (!created) {
    updateStatus(localText('追加に必要な参照先がありません。', 'Required referenced entities are missing.'));
    return;
  }
  refreshGrid();
  const index = currentRows.indexOf(created);
  if (index >= 0) currentGrid?.selectRow(index, { scroll: true, focus: true });
}

async function deleteSelectedRows(): Promise<void> {
  const provider = tabProviders[activeTab];
  const selected = currentGrid?.getSelectedRows() ?? [];
  if (!provider?.remove || selected.length === 0) return;
  const confirmed = await dialogService.confirm({
    title: t('dialog.deleteTitle'),
    body: t('dialog.deleteBody', selected.length),
    confirmLabel: t('toolbar.deleteRow'),
    cancelLabel: t('dialog.cancel'),
    destructive: true,
  });
  if (!confirmed) return;
  let dependencyError: string | null = null;
  mutateDocument('Delete rows', () => {
    dependencyError = provider.remove!(selected);
  });
  if (dependencyError) {
    updateStatus(dependencyError);
    return;
  }
  resetViewerSelection();
  refreshGrid();
}

function duplicateSelectedRows(): void {
  const provider = tabProviders[activeTab];
  const selected = currentGrid?.getSelectedRows() ?? [];
  if (!provider?.duplicate || selected.length === 0) {
    updateStatus(localText('複製する行を選択してください。', 'Select rows to duplicate.'));
    return;
  }
  const duplicates = mutateDocument('Duplicate rows', () => provider.duplicate!(selected));
  refreshGrid();
  const indices = duplicates.map(item => currentRows.indexOf(item)).filter(index => index >= 0);
  currentGrid?.setSelectedRowIndices(indices);
}

async function changeSelectedNumber(): Promise<void> {
  const provider = tabProviders[activeTab];
  const selected = currentGrid?.getSelectedRows() ?? [];
  if (!provider?.numberKind || selected.length !== 1) return;
  const row = selected[0] as { number: number };
  const values = await requestFields(localText('番号を変更', 'Change number'), [{
    name: 'number',
    label: localText('新しい番号', 'New number'),
    value: String(row.number),
    type: 'number',
  }]);
  if (!values) return;
  const newNumber = Number(values.number);
  mutateDocument('Change entity number', () => doc.changeEntityNumber(provider.numberKind!, row.number, newNumber));
  currentSelection = provider.selectionForRow?.(row) ?? { kind: 'none' };
  viewer.setSelection(currentSelection, false);
  refreshGrid();
  syncGridToViewerSelection(currentSelection);
}

function setupViewer(): void {
  viewer = new ModelViewer(byId('viewer-panel'), doc);
  viewer.setOnSelectionChanged(selection => {
    currentSelection = selection;
    renderSelectionInfo(selection);
    if (!selectionSyncInProgress) syncGridToViewerSelection(selection, true);
  });
  viewer.setOnDrawingEvent(handleDrawingEvent);
  viewer.setLabelDensity({ mode: 'auto', maxLabels: 400, minSpacingPx: 28 });
}

function setupViewerToolbar(): void {
  on('view-fit', () => viewer.fitToView());
  on('view-top', () => setStandardView('top'));
  on('view-front', () => setStandardView('front'));
  on('view-side', () => setStandardView('side'));
  on('view-iso', () => setStandardView('isometric'));
  on('view-projection', toggleProjection);
  on('view-plane', togglePlanView);
  on('view-elevation-x', () => toggleElevationView('elevation-x'));
  on('view-elevation-y', () => toggleElevationView('elevation-y'));
  on('view-draw-node', () => toggleDrawingMode('node'));
  on('view-draw-member', () => toggleDrawingMode('member'));
  on('view-move', () => toggleDrawingMode('move'));
  on('view-duplicate', () => toggleDrawingMode('duplicate'));
  on('view-loads', toggleLoads);
  on('view-results', showResultsPanel);
  updateViewerToggleStates();
}

function setStandardView(view: StandardView): void {
  viewer.setViewMode({ kind: '3d' }, false);
  viewer.setStandardView(view, true);
  updateViewerToggleStates();
  updateStatus(t('status.viewChanged'));
}

function toggleProjection(): void {
  viewer.setProjectionMode(viewer.getProjectionMode() === 'perspective' ? 'orthographic' : 'perspective');
  updateViewerToggleStates();
}

function togglePlanView(): void {
  const plan = viewer.getViewMode().kind !== 'plan';
  viewer.setViewMode(plan ? { kind: 'plan' } : { kind: '3d' }, true);
  updateViewerToggleStates();
}

function toggleElevationView(kind: 'elevation-x' | 'elevation-y'): void {
  const active = viewer.getViewMode().kind === kind;
  viewer.setViewMode(active ? { kind: '3d' } : { kind }, true);
  updateViewerToggleStates();
}

function toggleLoads(): void {
  const visible = !viewer.getLayerVisibility().loads;
  viewer.setLayerVisibility({ loads: visible });
  viewer.setLoadDisplay({ visible });
  updateViewerToggleStates();
}

function toggleDrawingMode(mode: Exclude<DrawingMode, 'none'>): void {
  if ((mode === 'move' || mode === 'duplicate') && currentSelection.kind === 'none') {
    updateStatus(localText('先に節点・部材・壁を選択してください。', 'Select a node, member, or wall first.'));
    return;
  }
  const next = viewer.getDrawingMode() === mode ? 'none' : mode;
  viewer.setDrawingMode(next, { gridSpacing: 100, snapToGrid: true, snapToNodes: true });
  updateViewerToggleStates();
  updateDrawingHint();
  if (next !== 'none') viewer.focus();
}

function updateDrawingHint(): void {
  if (!viewer) return;
  const next = viewer.getDrawingMode();
  const hint = byId('drawing-hint');
  hint.classList.toggle('hidden', next === 'none');
  const pointerHint = next === 'node'
    ? t('draw.nodeHint')
    : next === 'member'
      ? t('draw.memberHint')
      : next === 'move'
        ? currentSelection.kind === 'node'
          ? localText('節点の移動先をクリックします。Escで終了します。', 'Click the destination for the node. Press Escape to finish.')
          : localText(
              '構成節点の移動先をクリックします。共有節点に接続する他要素も追従します。Escで終了します。',
              'Click the destination for the constituent nodes. Other entities connected to shared nodes will follow. Press Escape to finish.',
            )
        : next === 'duplicate'
          ? localText('選択要素の複製先をクリックします。Escで終了します。', 'Click the destination for a duplicate. Press Escape to finish.')
          : '';
  hint.textContent = pointerHint
    ? `${pointerHint} ${localText('キーボードでは矢印キーで照準を動かしEnterで確定します。', 'Keyboard: move the crosshair with arrow keys and press Enter to confirm.')}`
    : '';
}

function updateViewerToggleStates(): void {
  if (!viewer) return;
  const viewKind = viewer.getViewMode().kind;
  const drawingMode = viewer.getDrawingMode();
  const layers = viewer.getLayerVisibility();
  setPressed('view-projection', viewer.getProjectionMode() === 'orthographic');
  setPressed('menu-projection', viewer.getProjectionMode() === 'orthographic');
  setPressed('view-plane', viewKind === 'plan');
  setPressed('view-elevation-x', viewKind === 'elevation-x');
  setPressed('view-elevation-y', viewKind === 'elevation-y');
  setPressed('view-draw-node', drawingMode === 'node');
  setPressed('view-draw-member', drawingMode === 'member');
  setPressed('view-move', drawingMode === 'move');
  setPressed('view-duplicate', drawingMode === 'duplicate');
  setPressed('view-loads', layers.loads);
  setPressed('menu-toggle-loads', layers.loads);
  setPressed('menu-toggle-boundaries', layers.boundaries);
  setPressed('menu-show-node-num', viewer.showNodeNumbers);
  setPressed('menu-show-member-num', viewer.showMemberNumbers);
  setPressed('menu-show-wall-num', viewer.showWallNumbers);
  setPressed('view-results', layers.results && resultSet !== null);
}

function handleDrawingEvent(event: DrawingEvent): void {
  if (event.type === 'cancel') {
    viewer.setDrawingMode('none');
    byId('drawing-hint').classList.add('hidden');
    updateViewerToggleStates();
    return;
  }
  if (event.type === 'selection-move') {
    transformSelection(event.selection, event.target, event.duplicate);
    return;
  }
  if (event.type === 'member-start') {
    byId('drawing-hint').textContent = localText('終点をクリックしてください。', 'Click the member end point.');
    return;
  }
  if (event.type === 'node-create') {
    if (event.existingNodeNumber) return;
    const node = mutateDocument('Draw node', () => doc.addNode(doc.createNode(...event.position)));
    currentSelection = { kind: 'node', nodeNumber: node.number };
    viewer.setSelection(currentSelection);
    showTab('nodes', true);
    return;
  }
  if (event.type === 'member-create') {
    const member = mutateDocument('Draw member', () => {
      const start = event.startNodeNumber
        ? doc.findNodeByNumber(event.startNodeNumber)
        : doc.addNode(doc.createNode(...event.start));
      const end = event.endNodeNumber
        ? doc.findNodeByNumber(event.endNodeNumber)
        : doc.addNode(doc.createNode(...event.end));
      if (!start || !end || start.number === end.number) throw new Error('A member requires two distinct nodes.');
      const created = doc.createMember();
      created.iNodeNumber = start.number;
      created.jNodeNumber = end.number;
      created.sectionNumber = ensureDefaultSection().number;
      return doc.addMember(created);
    });
    currentSelection = { kind: 'member', memberNumber: member.number };
    viewer.setSelection(currentSelection);
    showTab('members', true);
  }
}

function transformSelection(
  selection: Exclude<ViewerSelection, { kind: 'none' }>,
  target: [number, number, number],
  duplicate: boolean,
): void {
  const sourceNodeNumbers = selection.kind === 'node'
    ? [selection.nodeNumber]
    : selection.kind === 'member'
      ? (() => {
          const member = doc.findMemberByNumber(selection.memberNumber);
          return member ? [member.iNodeNumber, member.jNodeNumber] : [];
        })()
      : (() => {
          const wall = doc.walls.find(item => item.number === selection.wallNumber);
          return wall ? [wall.leftBottomNode, wall.rightBottomNode, wall.leftTopNode, wall.rightTopNode] : [];
        })();
  const sourceNodes = [...new Set(sourceNodeNumbers)]
    .map(number => doc.findNodeByNumber(number))
    .filter((node): node is Node => node !== undefined);
  if (sourceNodes.length === 0) {
    updateStatus(localText('移動または複製する要素が見つかりません。', 'The selected entity is no longer available.'));
    return;
  }
  const center: [number, number, number] = [
    sourceNodes.reduce((sum, node) => sum + node.x, 0) / sourceNodes.length,
    sourceNodes.reduce((sum, node) => sum + node.y, 0) / sourceNodes.length,
    sourceNodes.reduce((sum, node) => sum + node.z, 0) / sourceNodes.length,
  ];
  const projectedTarget: [number, number, number] = [...target];
  const viewKind = viewer.getViewMode().kind;
  if (viewKind === 'plan' || viewKind === '3d') projectedTarget[2] = center[2];
  else if (viewKind === 'elevation-x') projectedTarget[1] = center[1];
  else if (viewKind === 'elevation-y') projectedTarget[0] = center[0];
  const delta: [number, number, number] = [
    projectedTarget[0] - center[0],
    projectedTarget[1] - center[1],
    projectedTarget[2] - center[2],
  ];
  let nextSelection: ViewerSelection = selection;

  mutateDocument(duplicate ? 'Duplicate selection in view' : 'Move selection in view', () => {
    const movedNodes = duplicate
      ? sourceNodes.map(node => {
          const copy = cloneNode(node);
          copy.x += delta[0];
          copy.y += delta[1];
          copy.z += delta[2];
          return copy;
        })
      : sourceNodes;
    if (!duplicate) {
      for (const node of movedNodes) {
        node.x += delta[0];
        node.y += delta[1];
        node.z += delta[2];
      }
    }
    const replacementByNodeNumber = new Map(sourceNodes.map((node, index) => [node.number, movedNodes[index].number]));
    if (selection.kind === 'node') {
      nextSelection = { kind: 'node', nodeNumber: movedNodes[0].number };
    } else if (selection.kind === 'member' && duplicate) {
      const source = doc.findMemberByNumber(selection.memberNumber);
      if (!source) throw new Error('The selected member no longer exists.');
      const copy = cloneMember(source);
      copy.iNodeNumber = replacementByNodeNumber.get(source.iNodeNumber) ?? source.iNodeNumber;
      copy.jNodeNumber = replacementByNodeNumber.get(source.jNodeNumber) ?? source.jNodeNumber;
      for (const link of doc.analysisMetadata?.linkElements.filter(item => item.tag === copy.number) ?? []) {
        link.nodeI = copy.iNodeNumber;
        link.nodeJ = copy.jNodeNumber;
      }
      nextSelection = { kind: 'member', memberNumber: copy.number };
    } else if (selection.kind === 'wall' && duplicate) {
      const source = doc.walls.find(item => item.number === selection.wallNumber);
      if (!source) throw new Error('The selected wall no longer exists.');
      const copy = Object.assign(new Wall(), source);
      copy.number = nextNumber(doc.walls);
      copy.leftBottomNode = replacementByNodeNumber.get(source.leftBottomNode) ?? source.leftBottomNode;
      copy.rightBottomNode = replacementByNodeNumber.get(source.rightBottomNode) ?? source.rightBottomNode;
      copy.leftTopNode = replacementByNodeNumber.get(source.leftTopNode) ?? source.leftTopNode;
      copy.rightTopNode = replacementByNodeNumber.get(source.rightTopNode) ?? source.rightTopNode;
      doc.walls.push(copy);
      nextSelection = { kind: 'wall', wallNumber: copy.number };
    }
  });

  currentSelection = nextSelection;
  viewer.setSelection(nextSelection, false);
  viewer.setDrawingMode('none');
  byId('drawing-hint').classList.add('hidden');
  updateViewerToggleStates();
  const tabId = nextSelection.kind === 'node' ? 'nodes' : nextSelection.kind === 'member' ? 'members' : 'walls';
  showTab(tabId, true);
  updateStatus(duplicate
    ? localText('選択要素を複製しました。', 'Duplicated the selected entity.')
    : selection.kind === 'node'
      ? localText('節点を移動しました。', 'Moved the node.')
      : localText(
          '構成節点を移動しました。共有節点に接続する要素も追従しています。',
          'Moved the constituent nodes; entities connected to shared nodes followed.',
        ));
}

function setupSelectionPanel(): void {
  on('selection-info-close', resetViewerSelection);
}

function resetViewerSelection(): void {
  currentSelection = { kind: 'none' };
  viewer.clearSelection(false);
  currentGrid?.clearSelection(false);
  renderSelectionInfo(currentSelection);
}

function syncGridToViewerSelection(selection: ViewerSelection, switchTab = false): void {
  const tabId = selection.kind === 'node' ? 'nodes' : selection.kind === 'member' ? 'members' : selection.kind === 'wall' ? 'walls' : null;
  if (!tabId) {
    currentGrid?.clearSelection(false);
    return;
  }
  if (switchTab && activeTab !== tabId) showTab(tabId);
  const provider = tabProviders[activeTab];
  const index = provider?.indexForSelection?.(currentRows, selection) ?? -1;
  selectionSyncInProgress = true;
  if (index >= 0) {
    currentGrid?.selectRow(index, { scroll: true, notify: false });
    currentGrid?.setActiveCell(index, 0);
  }
  else currentGrid?.clearSelection(false);
  selectionSyncInProgress = false;
}

function renderSelectionInfo(selection: ViewerSelection): void {
  const panel = byId('selection-info-panel');
  const title = byId('selection-info-title');
  const body = byId('selection-info-body');
  body.replaceChildren();
  if (selection.kind === 'none') {
    panel.classList.add('hidden');
    return;
  }
  let fields: Array<[string, string | number]> = [];
  if (selection.kind === 'node') {
    const node = doc.findNodeByNumber(selection.nodeNumber);
    if (!node) return panel.classList.add('hidden');
    title.textContent = t('selection.title.node');
    fields = [
      [t('col.nodeNumber'), node.number],
      [t('col.xCoord'), node.x], [t('col.yCoord'), node.y], [t('col.zCoord'), node.z],
      [t('col.temperature'), node.temperature], [t('col.area'), node.area],
    ];
  } else if (selection.kind === 'member') {
    const member = doc.members.find(item => item.number === selection.memberNumber);
    if (!member) return panel.classList.add('hidden');
    title.textContent = t('selection.title.member');
    fields = [
      [t('col.memberNumber'), member.number], [t('col.iNode'), member.iNodeNumber],
      [t('col.jNode'), member.jNodeNumber], [t('col.section'), member.sectionNumber],
      ['P1', member.p1], ['P2', member.p2], ['P3', member.p3],
    ];
  } else {
    const wall = doc.walls.find(item => item.number === selection.wallNumber);
    if (!wall) return panel.classList.add('hidden');
    title.textContent = t('selection.title.wall');
    fields = [
      [t('col.wallNumber'), wall.number], [t('col.leftBottom'), wall.leftBottomNode],
      [t('col.rightBottom'), wall.rightBottomNode], [t('col.leftTop'), wall.leftTopNode],
      [t('col.rightTop'), wall.rightTopNode], [t('col.material'), wall.materialNumber],
    ];
  }
  const table = createElement('table', 'selection-info-table');
  for (const [label, rawValue] of fields) {
    const row = table.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = typeof rawValue === 'number' ? formatNumber(rawValue) : rawValue;
  }
  body.appendChild(table);
  panel.classList.remove('hidden');
}

function updateLoadCaseSelector(): void {
  const selector = document.getElementById('load-case-selector') as HTMLSelectElement | null;
  if (!selector) return;
  selector.replaceChildren();
  doc.loadCases.forEach((loadCase, index) => {
    const item = document.createElement('option');
    item.value = String(index);
    item.textContent = `${index + 1}: ${loadCase.name}`;
    selector.appendChild(item);
  });
  selector.value = String(doc.loadCaseIndex);
  selector.onchange = () => {
    mutateDocument('Change active load case', () => {
      doc.loadCaseIndex = Number(selector.value);
    });
  };
}

async function addLoadCase(): Promise<void> {
  const values = await requestFields(localText('荷重ケースを追加', 'Add load case'), [
    { name: 'name', label: localText('名前', 'Name'), value: `Load Case ${doc.loadCaseCount + 1}` },
    {
      name: 'type', label: localText('種別', 'Type'), type: 'select', value: LoadCaseType.Other,
      options: Object.values(LoadCaseType).map(value => ({ value, label: value })),
    },
    { name: 'memo', label: localText('メモ', 'Memo'), type: 'textarea' },
  ]);
  if (!values) return;
  mutateDocument('Add load case', () => {
    doc.addLoadCase({ name: values.name, type: values.type, memo: values.memo });
    doc.loadCaseIndex = doc.loadCaseCount - 1;
  });
}

function duplicateLoadCase(): void {
  mutateDocument('Duplicate load case', () => {
    const sourceIndex = doc.loadCaseIndex;
    doc.duplicateLoadCase(sourceIndex);
    doc.loadCaseIndex = sourceIndex + 1;
  });
}

async function removeLoadCase(): Promise<void> {
  if (doc.loadCaseCount <= 1) {
    updateStatus(localText('荷重ケースは最低1件必要です。', 'At least one load case is required.'));
    return;
  }
  const current = doc.loadCases[doc.loadCaseIndex];
  const confirmed = await dialogService.confirm({
    title: localText('荷重ケースを削除', 'Delete load case'),
    body: localText(`「${current.name}」を削除しますか？`, `Delete “${current.name}”?`),
    confirmLabel: localText('削除', 'Delete'),
    cancelLabel: t('dialog.cancel'),
    destructive: true,
  });
  if (!confirmed) return;
  mutateDocument('Remove load case', () => doc.removeLoadCase(doc.loadCaseIndex));
  updateLoadCaseSelector();
  refreshGrid();
}

function showLoadCombinationPanel(): void {
  const content = createElement('div');
  const currentCase = doc.loadCases[doc.loadCaseIndex];
  if (currentCase) {
    const caseForm = createElement('div', 'panel-form');
    const name = createElement('input');
    name.value = currentCase.name;
    const type = createElement('select');
    for (const value of Object.values(LoadCaseType)) {
      const item = document.createElement('option');
      item.value = value;
      item.textContent = value;
      item.selected = currentCase.type === value;
      type.appendChild(item);
    }
    const memo = createElement('textarea');
    memo.value = currentCase.memo;
    caseForm.append(
      labelled(localText('現在のケース名', 'Current case name'), name),
      labelled(localText('種別', 'Type'), type),
      labelled(localText('メモ', 'Memo'), memo),
      createButton(localText('ケース情報を更新', 'Update case'), () => {
        mutateDocument('Edit load case metadata', () => {
          currentCase.name = name.value.trim() || currentCase.name;
          currentCase.type = type.value;
          currentCase.memo = memo.value;
        });
        updateLoadCaseSelector();
      }),
    );
    content.appendChild(caseForm);
  }
  const list = createElement('div', 'diagnostic-list');
  for (const combination of doc.loadCombinations) {
    const row = createElement('div', 'diagnostic-item info');
    const terms = combination.terms.map(term => `${term.loadCaseId} × ${term.factor}`).join(' + ');
    row.append(createElement('span', undefined, `${combination.name}: ${terms}`));
    row.append(createButton(localText('削除', 'Delete'), () => {
      mutateDocument('Delete load combination', () => {
        const index = doc.loadCombinations.indexOf(combination);
        if (index >= 0) doc.loadCombinations.splice(index, 1);
      });
      showLoadCombinationPanel();
    }, 'toolbar-btn toolbar-btn-danger'));
    list.appendChild(row);
  }
  content.appendChild(list);
  const form = createElement('div', 'panel-form');
  const combinationName = createElement('input');
  combinationName.placeholder = localText('例: 長期', 'e.g. Service');
  const terms = createElement('input');
  terms.placeholder = 'LC1:1.0, LC2:0.5';
  form.append(
    labelled(localText('組合せ名', 'Combination name'), combinationName),
    labelled(localText('係数（ID:係数）', 'Terms (ID:factor)'), terms),
    createButton(localText('組合せを追加', 'Add combination'), () => {
      const parsedTerms = terms.value.split(',').filter(Boolean).map(token => {
        const [loadCaseId, factorText] = token.trim().split(':');
        return { loadCaseId, factor: Number(factorText) };
      });
      mutateDocument('Add load combination', () => doc.addLoadCombination(combinationName.value.trim(), parsedTerms));
      showLoadCombinationPanel();
    }),
  );
  content.appendChild(form);
  toolPanel.open(t('loadcase.combinations'), content);
}

function labelled(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = createElement('label');
  label.append(createElement('span', undefined, labelText), control);
  return label;
}

async function requestFields(title: string, fields: DialogField[]): Promise<Record<string, string> | null> {
  const content = createElement('div', 'panel-form');
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  for (const field of fields) {
    let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.type === 'select') {
      control = createElement('select');
      for (const candidate of field.options ?? []) {
        const item = document.createElement('option');
        item.value = candidate.value;
        item.textContent = candidate.label;
        item.selected = candidate.value === field.value;
        control.appendChild(item);
      }
    } else if (field.type === 'textarea') {
      control = createElement('textarea');
      control.value = field.value ?? '';
    } else {
      control = createElement('input');
      control.type = field.type ?? 'text';
      control.value = field.value ?? '';
    }
    control.name = field.name;
    controls.set(field.name, control);
    content.appendChild(labelled(field.label, control));
  }
  const confirmed = await dialogService.confirm({
    title,
    body: content,
    confirmLabel: t('dialog.confirm'),
    cancelLabel: t('dialog.cancel'),
  });
  if (!confirmed) return null;
  return Object.fromEntries([...controls].map(([name, control]) => [name, control.value]));
}

function showValidationPanel(): void {
  const result = validateFrameDocument(doc);
  const content = createElement('div');
  content.appendChild(createElement(
    'p',
    undefined,
    localText(
      `エラー ${result.errorCount} / 警告 ${result.warningCount} / 情報 ${result.infoCount}`,
      `Errors ${result.errorCount} / Warnings ${result.warningCount} / Info ${result.infoCount}`,
    ),
  ));
  const list = createElement('div', 'diagnostic-list');
  if (result.diagnostics.length === 0) list.appendChild(createElement('p', undefined, t('diagnostic.none')));
  for (const diagnostic of result.diagnostics) {
    const item = createButton(
      `[${diagnostic.code}] ${diagnostic.message}`,
      () => selectDiagnosticTarget(diagnostic.entity.kind, diagnostic.entity.number),
      `diagnostic-item ${diagnostic.severity}`,
    );
    list.appendChild(item);
  }
  content.appendChild(list);
  toolPanel.open(t('panel.validation'), content);
  updateStatus(t('status.validated', result.errorCount, result.warningCount));
}

function selectDiagnosticTarget(kind: string, number?: number): void {
  if (number == null) return;
  if (kind === 'node' || kind === 'boundary') viewer.setSelection({ kind: 'node', nodeNumber: number });
  else if (kind === 'member') viewer.setSelection({ kind: 'member', memberNumber: number });
  else if (kind === 'wall') viewer.setSelection({ kind: 'wall', wallNumber: number });
  else {
    const tabByKind: Record<string, string> = { material: 'materials', section: 'sections', spring: 'springs' };
    const tab = tabByKind[kind];
    if (!tab) return;
    showTab(tab);
    const index = currentRows.findIndex(row => (row as { number?: number }).number === number);
    if (index >= 0) currentGrid?.selectRow(index, { scroll: true, focus: true });
  }
}

function showModelInfoPanel(): void {
  const statistics = calculateModelStatistics(doc);
  const content = createElement('div');
  const table = createElement('table', 'panel-table');
  const rows: Array<[string, string | number]> = [
    [localText('節点', 'Nodes'), statistics.counts.nodes],
    [localText('部材', 'Members'), statistics.counts.members],
    [localText('壁', 'Walls'), statistics.counts.walls],
    [localText('材料', 'Materials'), statistics.counts.materials],
    [localText('断面', 'Sections'), statistics.counts.sections],
    [localText('荷重ケース', 'Load cases'), statistics.counts.loadCases],
    [localText('部材総延長', 'Total member length'), formatNumber(statistics.totalMemberLength)],
    [localText('部材総体積', 'Total member volume'), formatNumber(statistics.totalMemberVolume)],
    [localText('孤立節点', 'Isolated nodes'), statistics.isolatedNodeNumbers.join(', ') || '-'],
  ];
  for (const [label, value] of rows) {
    const row = table.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = String(value);
  }
  content.appendChild(table);

  const form = createElement('div', 'panel-form');
  const labelDensity = createElement('select');
  const labelDensityLabels = {
    auto: localText('自動', 'Automatic'),
    all: localText('すべて', 'All'),
    'selected-only': localText('選択のみ', 'Selected only'),
  } as const;
  for (const mode of ['auto', 'all', 'selected-only'] as const) {
    const item = document.createElement('option');
    item.value = mode;
    item.textContent = labelDensityLabels[mode];
    item.selected = viewer.getLabelDensity().mode === mode;
    labelDensity.appendChild(item);
  }
  labelDensity.addEventListener('change', () => viewer.setLabelDensity({ mode: labelDensity.value as 'auto' | 'all' | 'selected-only' }));
  const colorMode = createElement('select');
  const colorModeLabels = {
    default: localText('標準', 'Default'),
    section: localText('断面別', 'By section'),
    material: localText('材料別', 'By material'),
    'element-type': localText('要素種別', 'By element type'),
  } as const;
  for (const mode of ['default', 'section', 'material', 'element-type'] as const) {
    const item = document.createElement('option');
    item.value = mode;
    item.textContent = colorModeLabels[mode];
    item.selected = viewer.getMemberColorMode() === mode;
    colorMode.appendChild(item);
  }
  const selectionMode = createElement('select');
  const selectionModeLabels = {
    normal: localText('通常', 'Normal'),
    'selected-only': localText('選択のみ表示', 'Selected only'),
    'dim-others': localText('選択以外を薄く表示', 'Dim others'),
  } as const;
  for (const mode of ['normal', 'selected-only', 'dim-others'] as const) {
    const item = document.createElement('option');
    item.value = mode;
    item.textContent = selectionModeLabels[mode];
    item.selected = viewer.getSelectionDisplayMode() === mode;
    selectionMode.appendChild(item);
  }
  selectionMode.addEventListener('change', () => viewer.setSelectionDisplayMode(selectionMode.value as 'normal' | 'selected-only' | 'dim-others'));
  const legend = createElement('div', 'color-legend');
  const renderLegend = (): void => {
    legend.replaceChildren();
    for (const entry of viewer.getColorLegend()) {
      const swatch = createElement('span', 'color-legend-swatch');
      swatch.style.backgroundColor = entry.color;
      const item = createElement('span', 'color-legend-item');
      item.append(swatch, document.createTextNode(entry.label));
      legend.appendChild(item);
    }
  };
  colorMode.addEventListener('change', () => {
    viewer.setMemberColorMode(colorMode.value as 'default' | 'section' | 'material' | 'element-type');
    renderLegend();
  });
  form.append(
    labelled(localText('ラベル密度', 'Label density'), labelDensity),
    labelled(localText('部材色分け', 'Member colors'), colorMode),
    labelled(localText('選択表示', 'Selection display'), selectionMode),
  );
  const layerFieldset = createElement('fieldset', 'panel-fieldset');
  layerFieldset.appendChild(createElement('legend', undefined, localText('表示レイヤー', 'Display layers')));
  const layerLabels: Record<keyof ViewerLayers, [string, string]> = {
    grid: ['グリッド', 'Grid'],
    axes: ['座標軸', 'Axes'],
    nodes: ['節点', 'Nodes'],
    members: ['部材', 'Members'],
    walls: ['壁', 'Walls'],
    boundaries: ['境界条件', 'Boundaries'],
    loads: ['荷重', 'Loads'],
    results: ['解析結果', 'Results'],
    labels: ['番号ラベル', 'Labels'],
  };
  const layers = viewer.getLayerVisibility();
  for (const key of Object.keys(layerLabels) as Array<keyof ViewerLayers>) {
    const checkbox = createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = layers[key];
    checkbox.addEventListener('change', () => {
      viewer.setLayerVisibility({ [key]: checkbox.checked });
      if (key === 'loads') viewer.setLoadDisplay({ visible: checkbox.checked });
      updateViewerToggleStates();
    });
    const label = createElement('label', 'panel-checkbox');
    label.append(checkbox, document.createTextNode(localText(...layerLabels[key])));
    layerFieldset.appendChild(label);
  }
  form.append(
    layerFieldset,
    createButton(localText('選択要素へズーム', 'Zoom to selection'), () => {
      if (!viewer.zoomToSelection()) updateStatus(localText('表示対象を選択してください。', 'Select an entity to zoom to.'));
    }, 'panel-action secondary'),
    createButton(localText('表示設定をリセット', 'Reset display settings'), () => {
      viewer.resetDisplay();
      updateViewerToggleStates();
      showModelInfoPanel();
    }, 'panel-action secondary'),
    legend,
  );
  renderLegend();
  content.appendChild(form);
  const metadata = doc.analysisMetadata;
  if (metadata) {
    content.appendChild(createElement(
      'p',
      undefined,
      localText(
        `解析メタデータ: 制約${metadata.constraints.length} / 質量${metadata.nodalMasses.length} / リンク${metadata.linkElements.length}`,
        `Analysis metadata: constraints ${metadata.constraints.length}, masses ${metadata.nodalMasses.length}, links ${metadata.linkElements.length}`,
      ),
    ));
  }
  content.appendChild(createButton(localText('数量CSVを書き出す', 'Export quantities CSV'), () => {
    const records = statistics.sectionQuantities.map(quantity => ({
      sectionNumber: quantity.sectionNumber,
      memberCount: quantity.memberCount,
      totalLength: quantity.totalLength,
      volume: quantity.volume,
    }));
    downloadText(recordsToCsv(records), `${safeFilename(doc.title || currentFileBase, DEFAULT_MODEL_NAME)}-quantities.csv`, 'text/csv;charset=utf-8');
  }));
  toolPanel.open(t('panel.modelInfo'), content);
}

function showSectionCalculator(): void {
  const content = createElement('div', 'panel-form');
  const sectionSelect = createElement('select');
  for (const section of doc.sections) {
    const item = document.createElement('option');
    item.value = String(section.number);
    item.textContent = `${section.number}: ${section.comment || '-'}`;
    sectionSelect.appendChild(item);
  }
  const shape = createElement('select');
  const shapes = [
    [SectionShape.Rectangle, localText('矩形', 'Rectangle')],
    [SectionShape.Circle, localText('円形', 'Circle')],
    [SectionShape.Box, localText('箱形', 'Box')],
    [SectionShape.H_Steel, 'H'],
  ] as const;
  for (const [value, label] of shapes) {
    const item = document.createElement('option');
    item.value = String(value);
    item.textContent = label;
    shape.appendChild(item);
  }
  const dimensions = [1, 2, 3, 4].map(index => {
    const input = createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = 'any';
    input.value = index <= 2 ? '10' : '1';
    return input;
  });
  const labels = dimensions.map((input, index) => labelled(`D${index + 1}`, input));
  const result = createElement('pre');
  const updateLabels = (): void => {
    const labelSets: Record<number, string[]> = {
      [SectionShape.Rectangle]: [localText('幅', 'Width'), localText('高さ', 'Height')],
      [SectionShape.Circle]: [localText('直径', 'Diameter')],
      [SectionShape.Box]: [localText('外幅', 'Outer width'), localText('外高さ', 'Outer height'), localText('厚さ', 'Thickness')],
      [SectionShape.H_Steel]: [localText('全高', 'Overall height'), localText('フランジ幅', 'Flange width'), localText('ウェブ厚', 'Web thickness'), localText('フランジ厚', 'Flange thickness')],
    };
    const current = labelSets[Number(shape.value)] ?? [];
    labels.forEach((label, index) => {
      label.classList.toggle('hidden', index >= current.length);
      const span = label.querySelector('span');
      if (span) span.textContent = current[index] ?? '';
    });
  };
  shape.addEventListener('change', updateLabels);
  updateLabels();
  const calculateInput = (): SectionPropertyInput => {
    const values = dimensions.map(input => Number(input.value));
    const selectedShape = Number(shape.value);
    if (selectedShape === SectionShape.Rectangle) return { shape: SectionShape.Rectangle, width: values[0], height: values[1] };
    if (selectedShape === SectionShape.Circle) return { shape: SectionShape.Circle, diameter: values[0] };
    if (selectedShape === SectionShape.Box) return { shape: SectionShape.Box, outerWidth: values[0], outerHeight: values[1], thickness: values[2] };
    return { shape: SectionShape.H_Steel, overallHeight: values[0], flangeWidth: values[1], webThickness: values[2], flangeThickness: values[3] };
  };
  content.append(
    labelled(localText('適用先断面', 'Target section'), sectionSelect),
    labelled(localText('形状', 'Shape'), shape),
    ...labels,
    createButton(localText('計算', 'Calculate'), () => {
      result.textContent = JSON.stringify(calculateSectionProperties(calculateInput()), null, 2);
    }),
    createButton(localText('計算して断面へ適用', 'Calculate and apply'), () => {
      const properties = mutateDocument('Calculate section properties', () => {
        const section = doc.findSectionByNumber(Number(sectionSelect.value)) ?? ensureDefaultSection();
        return applySectionProperties(section, calculateInput());
      });
      result.textContent = JSON.stringify(properties, null, 2);
      if (activeTab === 'sections') refreshGrid();
    }),
    result,
  );
  toolPanel.open(t('panel.sectionCalculator'), content);
}

function showImportReport(): void {
  const content = createElement('div', 'diagnostic-list');
  if (lastImportDiagnostics.length === 0) content.appendChild(createElement('p', undefined, t('diagnostic.none')));
  for (const diagnostic of lastImportDiagnostics) {
    content.appendChild(createButton(
      `[${diagnostic.code}] ${diagnostic.message}`,
      () => diagnostic.target && selectDiagnosticTarget(diagnostic.target.kind, diagnostic.target.number),
      `diagnostic-item ${diagnostic.level}`,
    ));
  }
  toolPanel.open(t('panel.importReport'), content);
}

function invalidateAnalysisResults(): boolean {
  if (!resultSet) return false;
  viewer.pauseResults();
  resultSet = null;
  viewer.setAnalysisResults(null);
  viewer.setLayerVisibility({ results: false });
  updateViewerToggleStates();
  return true;
}

function adaptAnalysisResult(result: AnalysisResult): AnalysisResultSet {
  return {
    id: result.title,
    name: result.title,
    loadCaseId: result.loadCaseId,
    combinationId: result.combinationId,
    units: result.units,
    frames: result.frames.map(frame => ({
      time: frame.time,
      nodes: frame.nodes.map(node => ({
        nodeNumber: node.nodeNumber,
        displacement: [node.displacement.x, node.displacement.y, node.displacement.z],
        rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
        reaction: node.reaction ? [node.reaction.axial, node.reaction.shearY, node.reaction.shearZ] : undefined,
        reactionMoment: node.reaction ? [node.reaction.torsion, node.reaction.momentY, node.reaction.momentZ] : undefined,
      })),
      members: frame.members.map(member => ({
        memberNumber: member.memberNumber,
        stations: [
          { position: 0, ...member.iEnd },
          { position: 1, ...member.jEnd },
        ],
      })),
    })),
  };
}

type SectionForceKey = 'axial' | 'shearY' | 'shearZ' | 'torsion' | 'momentY' | 'momentZ';

function recommendedSectionForceScale(component: SectionForceKey): number {
  if (!resultSet) return 1;
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (const node of doc.nodes) {
    minX = Math.min(minX, node.x); maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y); maxY = Math.max(maxY, node.y);
    minZ = Math.min(minZ, node.z); maxZ = Math.max(maxZ, node.z);
  }
  const span = doc.nodes.length === 0 ? 100 : Math.max(maxX - minX, maxY - minY, maxZ - minZ, 100);
  let maximum = 0;
  for (const resultFrame of resultSet.frames) {
    for (const member of resultFrame.members ?? []) {
      for (const station of member.stations ?? []) maximum = Math.max(maximum, Math.abs(station[component] ?? 0));
    }
  }
  return maximum > 0 ? (span * 0.15) / maximum : 1;
}

function showResultsPanel(): void {
  const content = createElement('div', 'panel-form');
  content.appendChild(createElement(
    'p',
    'diagnostic-item warn',
    localText(
      '実験的機能です。cm / kN / kN-cm、節点反力 global-xyz、部材力 local-xyz を明示した結果だけを読み込み、単位変換は行いません。',
      'Experimental: only results declaring cm / kN / kN-cm, global-xyz node reactions, and local-xyz member forces are accepted. No unit conversion is performed.',
    ),
  ));
  const input = createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  const frame = createElement('input');
  frame.type = 'range';
  frame.min = '0';
  frame.max = String(Math.max(0, (resultSet?.frames.length ?? 1) - 1));
  frame.value = String(viewer.getResultFrameIndex());
  const frameLabel = createElement('output', undefined, `${Number(frame.value) + 1} / ${resultSet?.frames.length ?? 0}`);
  const deformationScale = createElement('input');
  deformationScale.type = 'number';
  deformationScale.min = '0';
  deformationScale.step = '0.1';
  const currentDisplay = viewer.getResultDisplay();
  deformationScale.value = String(currentDisplay.deformationScale);
  const showDeformation = createElement('input');
  showDeformation.type = 'checkbox';
  showDeformation.checked = currentDisplay.showDeformation;
  const showReactions = createElement('input');
  showReactions.type = 'checkbox';
  showReactions.checked = resultSet ? currentDisplay.showReactions : true;
  const showUndeformed = createElement('input');
  showUndeformed.type = 'checkbox';
  showUndeformed.checked = currentDisplay.showUndeformed;
  const reactionScale = createElement('input');
  reactionScale.type = 'number';
  reactionScale.min = '0';
  reactionScale.step = '0.1';
  reactionScale.value = String(currentDisplay.reactionScale);
  const sectionForceScale = createElement('input');
  sectionForceScale.type = 'number';
  sectionForceScale.min = '0';
  sectionForceScale.step = 'any';
  sectionForceScale.value = String(currentDisplay.sectionForceScale);
  const sectionForce = createElement('select');
  const sectionForceLabels: Record<string, [string, string]> = {
    '': ['なし', 'None'],
    axial: ['軸力 N', 'Axial N'],
    shearY: ['せん断力 Qy', 'Shear Qy'],
    shearZ: ['せん断力 Qz', 'Shear Qz'],
    torsion: ['ねじり Mx', 'Torsion Mx'],
    momentY: ['曲げモーメント My', 'Moment My'],
    momentZ: ['曲げモーメント Mz', 'Moment Mz'],
  };
  for (const value of ['', 'axial', 'shearY', 'shearZ', 'torsion', 'momentY', 'momentZ']) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = localText(...sectionForceLabels[value]);
    item.selected = currentDisplay.sectionForce === value;
    sectionForce.appendChild(item);
  }
  const loadResults = async (): Promise<void> => {
    const file = input.files?.[0];
    if (!file) return;
    assertImportFileSize(file);
    const currentValidation = validateFrameDocument(doc);
    if (currentValidation.errorCount > 0) {
      throw new Error(localText(
        `現在のモデルに検証エラーが${currentValidation.errorCount}件あるため、解析結果を表示できません。先にモデル健全性センターで修正してください。`,
        `Analysis results cannot be displayed while the model has ${currentValidation.errorCount} validation errors. Fix them in Model Health Center first.`,
      ));
    }
    const parsed = parseAnalysisResult(await file.text());
    const knownNodes = new Set(doc.nodes.map(node => node.number));
    const knownMembers = new Set(doc.members.map(member => member.number));
    const unknownNodes = new Set<number>();
    const unknownMembers = new Set<number>();
    for (const resultFrame of parsed.frames) {
      for (const node of resultFrame.nodes) {
        if (!knownNodes.has(node.nodeNumber)) unknownNodes.add(node.nodeNumber);
      }
      for (const member of resultFrame.members) {
        if (!knownMembers.has(member.memberNumber)) unknownMembers.add(member.memberNumber);
      }
    }
    if (unknownNodes.size > 0 || unknownMembers.size > 0) {
      throw new Error(localText(
        `解析結果にモデル未登録の参照があります（節点: ${[...unknownNodes].join(', ') || '-'}、部材: ${[...unknownMembers].join(', ') || '-'}）。`,
        `Results reference entities outside the model (nodes: ${[...unknownNodes].join(', ') || '-'}; members: ${[...unknownMembers].join(', ') || '-'}).`,
      ));
    }
    if (parsed.loadCaseId && !doc.loadCases.some(loadCase => loadCase.id === parsed.loadCaseId)) {
      throw new Error(localText(
        `荷重ケースID「${parsed.loadCaseId}」は現在のモデルにありません。`,
        `Load case ID “${parsed.loadCaseId}” does not exist in the current model.`,
      ));
    }
    if (parsed.combinationId && !doc.loadCombinations.some(combination => combination.id === parsed.combinationId)) {
      throw new Error(localText(
        `荷重組合せID「${parsed.combinationId}」は現在のモデルにありません。`,
        `Load combination ID “${parsed.combinationId}” does not exist in the current model.`,
      ));
    }
    resultSet = adaptAnalysisResult(parsed);
    viewer.setAnalysisResults(resultSet);
    viewer.setLayerVisibility({ results: true });
    if (sectionForce.value) {
      sectionForceScale.value = String(recommendedSectionForceScale(sectionForce.value as SectionForceKey));
    }
    updateDisplay();
    frame.max = String(resultSet.frames.length - 1);
    frame.value = '0';
    frameLabel.textContent = `1 / ${resultSet.frames.length}`;
    updateViewerToggleStates();
    updateStatus(localText(`解析結果「${parsed.title || file.name}」を読み込みました`, `Loaded results “${parsed.title || file.name}”`));
  };
  input.addEventListener('change', () => {
    void loadResults().catch(reportError);
  });
  frame.addEventListener('input', () => {
    viewer.setResultFrame(Number(frame.value));
    frameLabel.textContent = `${Number(frame.value) + 1} / ${resultSet?.frames.length ?? 0}`;
  });
  const nonNegativeValue = (control: HTMLInputElement, fallback: number): number => {
    const value = Number(control.value);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const updateDisplay = (): void => viewer.setResultDisplay({
    showDeformation: showDeformation.checked,
    showReactions: showReactions.checked,
    showUndeformed: showUndeformed.checked,
    deformationScale: nonNegativeValue(deformationScale, 1),
    reactionScale: nonNegativeValue(reactionScale, 1),
    sectionForce: sectionForce.value ? sectionForce.value as SectionForceKey : null,
    sectionForceScale: nonNegativeValue(sectionForceScale, 1),
  });
  for (const control of [showDeformation, showReactions, showUndeformed, deformationScale, reactionScale, sectionForceScale]) {
    control.addEventListener('change', updateDisplay);
  }
  sectionForce.addEventListener('change', () => {
    if (sectionForce.value && resultSet) {
      sectionForceScale.value = String(recommendedSectionForceScale(sectionForce.value as SectionForceKey));
    }
    updateDisplay();
  });
  content.append(
    labelled(t('results.load'), input),
    labelled(localText('フレーム', 'Frame'), frame),
    frameLabel,
    labelled(localText('変形を表示', 'Show deformation'), showDeformation),
    labelled(localText('未変形形を表示', 'Show undeformed'), showUndeformed),
    labelled(t('results.scale'), deformationScale),
    labelled(localText('反力を表示', 'Show reactions'), showReactions),
    labelled(localText('反力倍率', 'Reaction scale'), reactionScale),
    labelled(localText('断面力', 'Section force'), sectionForce),
    labelled(localText('断面力倍率', 'Section-force scale'), sectionForceScale),
    createButton(localText('断面力倍率を自動調整', 'Auto-scale section forces'), () => {
      if (!sectionForce.value) return;
      sectionForceScale.value = String(recommendedSectionForceScale(sectionForce.value as SectionForceKey));
      updateDisplay();
    }, 'panel-action secondary'),
    createButton(t('results.play'), () => {
      viewer.playResults({
        fps: 12,
        loop: true,
        onFrame: index => {
          frame.value = String(index);
          frameLabel.textContent = `${index + 1} / ${resultSet?.frames.length ?? 0}`;
        },
      });
    }),
    createButton(t('results.pause'), () => viewer.pauseResults(), 'panel-action secondary'),
    createButton(localText('結果を閉じる', 'Unload results'), () => {
      invalidateAnalysisResults();
      showResultsPanel();
    }, 'panel-action secondary'),
  );
  toolPanel.open(t('panel.results'), content);
}

function refreshDocumentUi(fitToView: boolean): void {
  viewer.setLoadCase(doc.loadCaseIndex);
  viewer.updateModel(fitToView);
  refreshGrid();
  updateLoadCaseSelector();
  renderSelectionInfo(currentSelection);
  updateDirtyUi();
  updateModelSummary();
  updateViewerToggleStates();
}

function updateDirtyUi(): void {
  byId('dirty-indicator').classList.toggle('hidden', !history.isDirty);
  const undoButton = document.getElementById('menu-undo') as HTMLButtonElement | null;
  const redoButton = document.getElementById('menu-redo') as HTMLButtonElement | null;
  if (undoButton) undoButton.disabled = !history.canUndo;
  if (redoButton) redoButton.disabled = !history.canRedo;
}

function updateModelSummary(): void {
  byId('model-summary').textContent = localText(
    `節点 ${doc.nodes.length} / 部材 ${doc.members.length} / 壁 ${doc.walls.length} / 荷重 ${doc.loadCaseIndex + 1}/${doc.loadCaseCount}`,
    `Nodes ${doc.nodes.length} / Members ${doc.members.length} / Walls ${doc.walls.length} / Load ${doc.loadCaseIndex + 1}/${doc.loadCaseCount}`,
  );
}

function updateStatus(message: string): void {
  byId('status-text').textContent = message;
}

function setupResizer(): void {
  const handle = byId<HTMLButtonElement>('resize-handle');
  const panel = byId('data-panel');
  const stackedQuery = window.matchMedia('(max-width: 900px)');
  let startPosition = 0;
  let startSize = 0;
  const updateOrientation = (): void => {
    handle.setAttribute('aria-orientation', stackedQuery.matches ? 'horizontal' : 'vertical');
  };
  updateOrientation();
  stackedQuery.addEventListener('change', updateOrientation);
  handle.addEventListener('pointerdown', event => {
    startPosition = stackedQuery.matches ? event.clientY : event.clientX;
    startSize = stackedQuery.matches ? panel.offsetHeight : panel.offsetWidth;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    if (stackedQuery.matches) {
      const height = Math.max(180, startSize + startPosition - event.clientY);
      panel.style.flexBasis = `${height}px`;
    } else {
      panel.style.flexBasis = `${Math.max(MIN_DATA_PANEL_WIDTH, startSize + startPosition - event.clientX)}px`;
    }
    viewer.resize();
  });
  handle.addEventListener('pointerup', event => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    viewer.resize();
  });
  handle.addEventListener('keydown', event => {
    const supported = stackedQuery.matches
      ? event.key === 'ArrowUp' || event.key === 'ArrowDown'
      : event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (!supported) return;
    event.preventDefault();
    if (stackedQuery.matches) {
      const delta = event.key === 'ArrowUp' ? 20 : -20;
      panel.style.flexBasis = `${Math.max(180, panel.offsetHeight + delta)}px`;
    } else {
      const delta = event.key === 'ArrowLeft' ? 20 : -20;
      panel.style.flexBasis = `${Math.max(MIN_DATA_PANEL_WIDTH, panel.offsetWidth + delta)}px`;
    }
    viewer.resize();
  });
}

function setupKeyboardShortcuts(): void {
  document.addEventListener('keydown', event => {
    const applicationDialog = byId<HTMLDialogElement>('app-dialog');
    if (!byId('help-overlay').classList.contains('hidden') || applicationDialog.open) return;
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveJson();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      void openFilePicker();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      if (editing) return;
      event.preventDefault();
      undo();
    } else if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
      if (editing) return;
      event.preventDefault();
      redo();
    } else if (event.key === 'Delete' && !editing) {
      event.preventDefault();
      void deleteSelectedRows();
    } else if (event.key === 'Escape') {
      viewer.setDrawingMode('none');
      toolPanel.close();
      resetViewerSelection();
      byId('drawing-hint').classList.add('hidden');
      updateViewerToggleStates();
    } else if (event.key.toLowerCase() === 'f' && !editing) {
      viewer.fitToView();
    }
  });
}

document.addEventListener('DOMContentLoaded', initialize);
