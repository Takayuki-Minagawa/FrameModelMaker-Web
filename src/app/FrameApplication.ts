import { prepareCsvEdit } from '../services/BulkEdit';
import type { PatternSelection } from '../services/ModelPatterns';
import { settings } from '../services/SettingsRepository';
import { importCsv, previewPaste } from './BulkEditPanel';
import { EditorController } from './EditorController';
import { createDrawingPanel } from './DrawingPanel';
import { createFileOperations } from './FileOperations';
import { createGridColumns } from './GridColumns';
import { createLoadCasePanel, describeLoadCase } from './LoadCasePanel';
import { createModelInfoPanel } from './ModelInfoPanel';
import { showFrameTemplateDialog, showPatternDialog } from './PatternPanel';
import { PresetPanel } from './PresetPanel';
import { RecoveryPanel } from './RecoveryPanel';
import { createResultsPanel } from './ResultsPanel';
import { createSectionCalculator } from './SectionCalculatorPanel';
import { renderSelectionPanel } from './SelectionPanel';
import { createTabProviders, type TabId, type TabProvider } from './TabProviders';
import {
  byId,
  createButton,
  createElement,
  localText,
  nextNumber,
  requestFields,
  setPressed,
  setUiErrorHandler,
} from './UiHelpers';

import { getLang, Lang, setLang, t } from '../i18n';
import { parseFrameJson, writeFrameJson } from '../io/FrameJson';
import { FrameDocument } from '../models/FrameDocument';
import { LoadCaseType } from '../models/LoadCase';
import { Node } from '../models/Node';
import { Wall } from '../models/Wall';
import { DocumentHistory } from '../services/DocumentHistory';
import { DataGrid } from '../ui/DataGrid';
import { validateFrameDocument } from '../validation/FrameValidator';
import { DrawingEvent, DrawingMode, ModelViewer, StandardView, ViewerSelection } from '../viewer/ModelViewer';
import { DialogService } from './DialogService';
import { assertImportFileSize } from './FileDownloads';
import { ToolPanel } from './ToolPanel';

const MERGE_NODE_THRESHOLD = 2;
const MIN_DATA_PANEL_WIDTH = 280;

const doc = new FrameDocument();
const getColumnsFromConfig = createGridColumns(doc);
const history = new DocumentHistory(doc, { maxEntries: 100, trustChangeNotifications: true });
const { tabProviders, ensureDefaultSection, cloneNode, cloneMember } = createTabProviders(doc);

const editor = new EditorController(doc, history);
let recovery: RecoveryPanel;
let presets: PresetPanel;
let sectionCalculator: () => void;
let modelInfo: () => void;
let files: ReturnType<typeof createFileOperations>;
let viewer: ModelViewer;
let dialogService: DialogService;
let toolPanel: ToolPanel;
// A heterogeneous grid is intentional: each tab owns its row type.
let currentGrid: DataGrid<Record<string, unknown>> | null = null;
let currentRows: Record<string, unknown>[] = [];
let activeTab: TabId = 'nodes';
let currentSelection: ViewerSelection = { kind: 'none' };
let helpPreviousFocus: HTMLElement | null = null;
let selectionSyncInProgress = false;
let results: ReturnType<typeof createResultsPanel>;
let loadCasePanel: ReturnType<typeof createLoadCasePanel>;
let drawingPanel: ReturnType<typeof createDrawingPanel>;
let statusSequence = 0;

export type NotifyKind = 'info' | 'success' | 'error' | 'cancel';

/**
 * Status notifications carry their kind and a sequence number so a stale error
 * can never be mistaken for the outcome of a later operation (R07).
 */
function notify(kind: NotifyKind, message: string): void {
  const element = document.getElementById('status-text');
  if (!element) return;
  statusSequence++;
  element.textContent = message;
  element.dataset.kind = kind;
  element.dataset.sequence = String(statusSequence);
  element.title = new Date().toLocaleTimeString();
}

/** Returns the live application state for integration tests. */
export function getApplicationForTesting() {
  return {
    doc,
    history,
    viewer,
    toolPanel,
    dialogService,
    loadCasePanel,
    results,
    drawingPanel,
    getSelection: () => currentSelection,
    getGrid: () => currentGrid,
    getActiveTab: () => activeTab,
    setCurrentSelection,
    notify,
    showTab,
  };
}

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

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  if (currentGrid && viewer) refreshDocumentUi(false);
  notify('error', localText(`エラー: ${message}`, `Error: ${message}`));
}

function on(id: string, handler: () => void | Promise<void>): void {
  const element = document.getElementById(id);
  element?.addEventListener('click', () => {
    Promise.resolve().then(handler).catch(reportError);
    element.closest('details')?.removeAttribute('open');
  });
}

export function initialize(): void {
  setUiErrorHandler(reportError);
  dialogService = new DialogService();
  toolPanel = new ToolPanel(() => viewer?.resize());
  files = createFileOperations({
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
    grid: () => currentGrid,
    tab: () => activeTab,
    recovery: () => recovery,
    resetGridFilters,
  });
  setupViewer();
  presets = new PresetPanel(doc, viewer, dialogService, toolPanel, mutateDocument, notify);
  results = createResultsPanel({
    doc,
    viewer,
    toolPanel,
    updateViewerToggleStates,
    updateStatus,
    reportError,
    getSelection: () => currentSelection,
  });
  modelInfo = createModelInfoPanel({ doc, viewer, toolPanel, updateViewerToggleStates, updateStatus });
  sectionCalculator = createSectionCalculator({
    doc,
    toolPanel,
    presets,
    ensureDefaultSection,
    mutateDocument,
    notify,
  });
  loadCasePanel = createLoadCasePanel({
    doc,
    dialogService,
    toolPanel,
    mutateDocument,
    setActiveLoadCaseIndex,
    notify,
  });
  drawingPanel = createDrawingPanel({
    doc,
    viewer,
    notify,
    onExit: () => {
      byId('drawing-hint').classList.add('hidden');
      updateViewerToggleStates();
    },
  });
  viewer.setOnDrawingCursor((info) => drawingPanel.syncCursor(info));
  on('menu-presets', () => presets.show());
  on('menu-pattern', () => {
    const selection: PatternSelection = { nodes: [], members: [], walls: [] };
    if (currentGrid && ['nodes', 'members', 'walls'].includes(activeTab)) {
      selection[activeTab as 'nodes' | 'members' | 'walls'] = currentGrid
        .getSelectedRows()
        .map((row) => Number(row.number));
    }
    if (!selection.nodes.length && !selection.members.length && !selection.walls.length) {
      if (currentSelection.kind === 'node') selection.nodes.push(currentSelection.nodeNumber);
      if (currentSelection.kind === 'member') selection.members.push(currentSelection.memberNumber);
      if (currentSelection.kind === 'wall') selection.walls.push(currentSelection.wallNumber);
    }
    return showPatternDialog(doc, selection, dialogService, mutateDocument, notify);
  });
  on('menu-frame-template', () => showFrameTemplateDialog(doc, dialogService, mutateDocument, notify));
  setupMenu();
  setupTabs();
  setupGridToolbar();
  setupViewerToolbar();
  on('menu-local-axes', () => {
    viewer.setLocalAxesVisible(!viewer.getLocalAxesVisible());
    updateViewerToggleStates();
    updateStatus(
      viewer.getLocalAxesVisible()
        ? localText(
            '局所軸: 表示（x=赤、y=緑、z=青。未指定軸は推定）',
            'Local axes: on (x=red, y=green, z=blue; unspecified axes are inferred).',
          )
        : localText('局所軸: 非表示', 'Local axes: off'),
    );
  });
  setupSelectionPanel();
  setupLayoutControls();
  setupResizer();
  setupTheme();
  setupLanguage();
  setupHelp();
  setupKeyboardShortcuts();
  recovery = new RecoveryPanel(
    history,
    toolPanel,
    () => doc.title,
    async (payload, record) => {
      if (!(await confirmDiscardChanges())) {
        notify('cancel', localText('復元を取り消しました。', 'Restore cancelled.'));
        return false;
      }
      history.restoreAutosave(payload);
      invalidateAnalysisResults();
      resetViewerSelection();
      resetGridFilters();
      refreshDocumentUi(true);
      notify(
        'success',
        localText(
          `復旧候補「${record.title || 'Untitled'} ${new Date(record.updatedAt).toLocaleString()}」から復元しました（節点 ${doc.nodes.length} / 部材 ${doc.members.length}）`,
          `Restored from recovery snapshot “${record.title || 'Untitled'} ${new Date(record.updatedAt).toLocaleString()}” (nodes ${doc.nodes.length} / members ${doc.members.length})`,
        ),
      );
      return true;
    },
    reportError,
    saveJson,
  );
  recovery.reportStatus = (message) => notify('success', message);
  applyI18n();
  void recovery.initialize();
  updateLoadCaseSelector();
  showTab('nodes');
  refreshDocumentUi(true);
  if (!history.isDirty) updateStatus(t('status.ready'));
}

function applyI18n(): void {
  document.documentElement.lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle;
    if (!key) return;
    const title = t(key);
    element.title = title;
    element.setAttribute('aria-label', title);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((element) => {
    const key = element.dataset.i18nAria;
    if (key) element.setAttribute('aria-label', t(key));
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (key) element.placeholder = t(key);
  });
  document.querySelectorAll<HTMLElement>('#tab-bar .tab').forEach((element) => {
    const definition = tabDefs.find((tab) => tab.id === element.dataset.tabId);
    if (definition) element.textContent = t(definition.i18nKey);
  });
  const dark = document.documentElement.dataset.theme === 'dark';
  byId<HTMLButtonElement>('btn-theme').textContent = dark ? t('theme.light') : t('theme.dark');
  byId<HTMLButtonElement>('btn-lang').textContent = getLang() === 'ja' ? 'EN' : 'JA';
  byId('help-title').textContent = t('help.title');
  byId<HTMLButtonElement>('selection-info-close').title = t('selection.closeInfo');
  document.querySelectorAll<HTMLOptionElement>('#tab-select option').forEach((option) => {
    const definition = tabDefs.find((tab) => tab.id === option.value);
    if (definition) option.textContent = t(definition.i18nKey);
  });
  recovery?.renderStatus();
  updateLoadCaseSelector();
  updateToolbarVisibility();
  if (currentGrid) refreshGrid();
  renderSelectionInfo(currentSelection);
  updateModelSummary();
  updateFilterState();
  viewer.setAccessibleLabel(
    localText(
      '対話型構造モデルビュー。矢印キーでカーソルを動かし、Enterで選択または作図します。',
      'Interactive structural model view. Move the cursor with arrow keys and press Enter to select or draw.',
    ),
  );
  updateDrawingHint();
  updateViewerToggleStates();
}

function setupTheme(): void {
  const saved = settings.getItem('theme');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = saved === 'dark' || (saved == null && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  viewer.setTheme(dark);
  on('btn-theme', () => {
    const nextDark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = nextDark ? 'dark' : 'light';
    settings.setItem('theme', nextDark ? 'dark' : 'light');
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
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  helpDialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...helpDialog.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.hasAttribute('disabled'));
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
    updateStatus(
      localText(
        `壁番号: ${viewer.showWallNumbers ? '表示' : '非表示'}`,
        `Wall numbers: ${viewer.showWallNumbers ? 'on' : 'off'}`,
      ),
    );
  });
  on('menu-toggle-loads', toggleLoads);
  on('menu-toggle-boundaries', () => {
    const layers = viewer.getLayerVisibility();
    viewer.setLayerVisibility({ boundaries: !layers.boundaries });
    updateViewerToggleStates();
  });

  on('menu-undo', undo);
  on('menu-redo', redo);
  on('menu-sort', () => {
    mutateDocument('Sort', () => doc.sort());
    notify('success', t('status.sorted'));
  });
  on('menu-renumber', () => {
    mutateDocument('Renumber', () => doc.assignNumbers());
    resetViewerSelection();
    notify('success', t('status.renumbered'));
  });
  on('menu-merge', mergeOverlappingNodesWithPreview);
  on('menu-duplicate', duplicateSelectedRows);

  on('menu-add-loadcase', addLoadCase);
  on('menu-copy-loadcase', duplicateLoadCase);
  on('menu-remove-loadcase', removeLoadCase);
  on('menu-load-combinations', () => loadCasePanel.show());

  on('menu-validate', showValidationPanel);
  on('menu-model-info', showModelInfoPanel);
  on('menu-section-calculator', showSectionCalculator);
  on('menu-import-report', showImportReport);
  on('menu-results', showResultsPanel);
}

async function mergeOverlappingNodesWithPreview(): Promise<void> {
  const values = await requestFields(dialogService, localText('近接節点を統合', 'Merge nearby nodes'), [
    {
      name: 'threshold',
      label: localText('統合距離（cm）', 'Merge distance (cm)'),
      value: String(MERGE_NODE_THRESHOLD),
      type: 'number',
    },
  ]);
  if (!values) return;
  const threshold = Number(values.threshold);
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error(
      localText(
        '統合距離は0以上の有限値を指定してください。',
        'Merge distance must be a finite non-negative value.',
      ),
    );
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
    doc.walls = doc.walls.filter((wall) => !removedWallNumbers.has(wall.number));
    return merged;
  });
  resetViewerSelection();
  updateStatus(
    localText(
      `${result.mergedNodeCount}節点を統合、${result.removedMemberNumbers.length}部材と${result.degenerateWallNumbers.length}壁を除去しました`,
      `Merged ${result.mergedNodeCount} nodes; removed ${result.removedMemberNumbers.length} members and ${result.degenerateWallNumbers.length} walls`,
    ),
  );
}

function mutateDocument<T>(label: string, action: () => T, fitToView = false): T {
  const value = editor.execute(label, action);
  const invalidatedResults = invalidateAnalysisResults();
  refreshDocumentUi(fitToView);
  scheduleAutosave();
  if (invalidatedResults) {
    notify(
      'info',
      localText(
        'モデルが変更されたため、読み込み済みの解析結果を破棄しました。',
        'Loaded analysis results were discarded because the model changed.',
      ),
    );
  }
  return value;
}

function undo(): void {
  if (!history.undo()) return;
  const invalidatedResults = invalidateAnalysisResults();
  refreshDocumentUi(false);
  setCurrentSelection(currentSelection);
  scheduleAutosave();
  notify(
    'success',
    invalidatedResults
      ? localText(
          '元に戻しました。解析結果は破棄しました。',
          'Undone; loaded analysis results were discarded.',
        )
      : t('status.undo'),
  );
}

function redo(): void {
  if (!history.redo()) return;
  const invalidatedResults = invalidateAnalysisResults();
  refreshDocumentUi(false);
  setCurrentSelection(currentSelection);
  scheduleAutosave();
  notify(
    'success',
    invalidatedResults
      ? localText(
          'やり直しました。解析結果は破棄しました。',
          'Redone; loaded analysis results were discarded.',
        )
      : t('status.redo'),
  );
}

function scheduleAutosave(): void {
  recovery.schedule();
}

function setupTabs(): void {
  const tabBar = byId('tab-bar');
  tabBar.replaceChildren();
  const tabSelect = document.getElementById('tab-select') as HTMLSelectElement | null;
  if (tabSelect) {
    tabSelect.replaceChildren();
    for (const definition of tabDefs) {
      const option = document.createElement('option');
      option.value = definition.id;
      option.textContent = t(definition.i18nKey);
      tabSelect.appendChild(option);
    }
    tabSelect.addEventListener('change', () => showTab(tabSelect.value));
  }
  const scrollTabs = (direction: -1 | 1): void => {
    if (typeof tabBar.scrollBy === 'function') tabBar.scrollBy({ left: direction * 160, behavior: 'smooth' });
    else tabBar.scrollLeft += direction * 160;
  };
  document.getElementById('tab-scroll-prev')?.addEventListener('click', () => scrollTabs(-1));
  document.getElementById('tab-scroll-next')?.addEventListener('click', () => scrollTabs(1));
  for (const definition of tabDefs) {
    const button = createElement('button', 'tab', t(definition.i18nKey));
    button.type = 'button';
    button.role = 'tab';
    button.dataset.tabId = definition.id;
    button.id = `tab-${definition.id}`;
    button.setAttribute('aria-controls', 'grid-container');
    button.addEventListener('click', () => showTab(definition.id));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const index = tabDefs.findIndex((tab) => tab.id === definition.id);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabDefs[(index + delta + tabDefs.length) % tabDefs.length];
      showTab(next.id);
      byId<HTMLButtonElement>(`tab-${next.id}`).focus();
    });
    tabBar.appendChild(button);
  }
}

function activeProvider(): TabProvider<Record<string, unknown>> {
  return tabProviders[activeTab] as unknown as TabProvider<Record<string, unknown>>;
}

function showTab(tabId: string, preserveSelection = false): void {
  if (!(tabId in tabProviders)) return;
  activeTab = tabId as TabId;
  document.querySelectorAll<HTMLElement>('#tab-bar .tab').forEach((tab) => {
    const active = tab.dataset.tabId === tabId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  byId('grid-container').setAttribute('aria-labelledby', `tab-${tabId}`);
  const tabSelect = document.getElementById('tab-select') as HTMLSelectElement | null;
  if (tabSelect) tabSelect.value = tabId;
  const activeButton = document.getElementById(`tab-${tabId}`);
  if (activeButton && typeof activeButton.scrollIntoView === 'function')
    activeButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateToolbarVisibility();
  refreshGrid();
  if (preserveSelection) syncGridToViewerSelection(currentSelection);
}

/** Maximize either the data table or the 3D view; both buttons are mutually exclusive (R09). */
function setupLayoutControls(): void {
  const main = byId('main-content');
  const apply = (mode: 'data' | 'view' | 'none'): void => {
    main.classList.toggle('data-maximized', mode === 'data');
    main.classList.toggle('view-maximized', mode === 'view');
    main.dataset.layout = mode;
    setPressed('btn-maximize-data', mode === 'data');
    setPressed('btn-maximize-view', mode === 'view');
    viewer.resize();
  };
  on('btn-maximize-data', () => {
    const next = main.classList.contains('data-maximized') ? 'none' : 'data';
    apply(next);
    notify('info', next === 'data' ? t('layout.maximizeData') : t('layout.restore'));
  });
  on('btn-maximize-view', () => {
    const next = main.classList.contains('view-maximized') ? 'none' : 'view';
    apply(next);
    notify('info', next === 'view' ? t('layout.maximizeView') : t('layout.restore'));
  });
  apply('none');
}

/** Shows the active search query and the visible / total row counts under the toolbar (R09). */
function updateFilterState(): void {
  const element = document.getElementById('grid-filter-state');
  if (!element) return;
  const query = currentGrid?.getSearchQuery() ?? '';
  const total = currentRows.length;
  const visible = currentGrid?.getVisibleRowIndices().length ?? total;
  element.dataset.query = query;
  element.dataset.visible = String(visible);
  element.dataset.total = String(total);
  element.textContent = query ? t('filter.state', query, visible, total) : '';
}

function resetGridFilters(): void {
  const search = document.getElementById('grid-search') as HTMLInputElement | null;
  if (search) search.value = '';
  currentGrid?.setSearchQuery('');
  updateFilterState();
}

function setupGridToolbar(): void {
  on('menu-import-csv', () => {
    const input = createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file || !currentGrid) return;
      const tab = activeTab;
      const columns = currentGrid.getColumns().map((column) => column.key);
      const revision = doc.revision;
      assertImportFileSize(file);
      void file
        .text()
        .then(async (text) => {
          if (revision !== doc.revision || tab !== activeTab) return;
          await importCsv(doc, tab, text, columns, dialogService, (incoming) =>
            mutateDocument('CSV import', () => doc.replaceWith(incoming)),
          );
        })
        .catch(reportError);
    });
    input.click();
  });
  on('menu-bulk-attribute', async () => {
    if (!currentGrid) return;
    const grid = currentGrid;
    const revision = doc.revision;
    const rows = grid.getSelectedRowIndices();
    if (!rows.length) return;
    const tab = activeTab;
    const identity = ['nodeloads', 'boundaries'].includes(tab)
      ? 'nodeNumber'
      : ['memberloads', 'cmqloads'].includes(tab)
        ? 'memberNumber'
        : 'number';
    const columns = grid.getColumns().filter((column) => !column.readOnly && column.key !== identity);
    const fields = await requestFields(dialogService, localText('選択行を一括変更', 'Edit selected rows'), [
      {
        name: 'column',
        label: localText('列', 'Column'),
        type: 'select',
        options: columns.map((column) => ({ value: column.key, label: column.header ?? column.key })),
      },
      { name: 'value', label: localText('値（空欄は変更しない）', 'Value (blank leaves unchanged)') },
    ]);
    if (!fields || grid !== currentGrid || revision !== doc.revision || fields.value === '') return;
    const quoted = '"' + fields.value.replace(/"/g, '""') + '"';
    const csv = [
      identity + ',' + fields.column,
      ...rows.map((index) => String(grid.getData()[index][identity]) + ',' + quoted),
    ].join('\n');
    const preview = prepareCsvEdit(doc, tab, csv, [identity, fields.column], 'update', 'cm-kN');
    const report = createElement('div');
    report.append(createElement('p', undefined, `${preview.changes.length} ${localText('変更', 'changes')}`));
    for (const error of preview.errors) report.append(createElement('p', 'diagnostic-item error', error));
    for (const change of preview.changes.slice(0, 100)) report.append(createElement('p', undefined, change));
    const apply = await dialogService.confirm({
      title: localText('一括変更プレビュー', 'Bulk edit preview'),
      body: report,
      confirmLabel: preview.errors.length ? localText('閉じる', 'Close') : localText('適用', 'Apply'),
    });
    if (apply && !preview.errors.length && grid === currentGrid && revision === doc.revision) {
      mutateDocument('Bulk attributes', () => doc.replaceWith(preview.document));
    }
  });
  const group = createElement('div');
  group.id = 'toolbar-buttons';
  const add = createButton(`+ ${t('toolbar.addRow')}`, addRow, 'toolbar-btn');
  add.id = 'btn-add-row';
  const remove = createButton(
    `− ${t('toolbar.deleteRow')}`,
    deleteSelectedRows,
    'toolbar-btn toolbar-btn-danger',
  );
  remove.id = 'btn-delete-row';
  const changeNumber = createButton(t('toolbar.changeNumber'), changeSelectedNumber, 'toolbar-btn secondary');
  changeNumber.id = 'btn-change-number';
  group.append(add, remove, changeNumber);
  byId('grid-toolbar').appendChild(group);

  byId<HTMLInputElement>('grid-search').addEventListener('input', (event) => {
    currentGrid?.setSearchQuery((event.currentTarget as HTMLInputElement).value);
    updateFilterState();
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
    const grid = currentGrid;
    const revision = doc.revision;
    await previewPaste(
      grid,
      text,
      undefined,
      dialogService,
      () => grid === currentGrid && revision === doc.revision,
    );
  });
}

function updateToolbarVisibility(): void {
  const provider = activeProvider();
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
  const provider = activeProvider();
  if (!provider) return;
  currentRows = provider.rows();
  const columns = getColumnsFromConfig<Record<string, unknown>>(activeTab);
  const grid = new DataGrid<Record<string, unknown>>(container, columns, currentRows, {
    selectionMode: 'multiple',
    onPasteRequest: (text, start) => {
      const revision = doc.revision;
      void previewPaste(
        grid,
        text,
        start,
        dialogService,
        () => currentGrid === grid && doc.revision === revision,
      ).catch(reportError);
    },
  });
  grid.setOnDataChanged((change) => {
    editor.commitGrid(change, provider.applyChanges);
    const invalidatedResults = invalidateAnalysisResults();
    if (['nodeloads', 'memberloads', 'cmqloads'].includes(activeTab)) viewer.updateAttributes('loads');
    else if (activeTab === 'boundaries') viewer.updateAttributes('boundaries');
    else if (['sections', 'materials', 'springs'].includes(activeTab)) viewer.updateAttributes('members');
    else viewer.updateModel(false);
    renderSelectionInfo(currentSelection);
    results.syncSelection();
    updateModelSummary();
    updateDirtyUi();
    updateLoadCaseSelector();
    toolPanel.notifyModelChanged();
    scheduleAutosave();
    const described = change.changes
      .slice(0, 3)
      .map((cell) => `${String(cell.columnKey)}=${String(cell.value)}`)
      .join(', ');
    notify(
      invalidatedResults ? 'info' : 'success',
      invalidatedResults
        ? localText(
            'モデルが変更されたため、読み込み済みの解析結果を破棄しました。',
            'Loaded analysis results were discarded because the model changed.',
          )
        : localText(
            `${change.changes.length}セルを更新しました（${described}${change.changes.length > 3 ? ', …' : ''}）`,
            `Updated ${change.changes.length} cell(s) (${described}${change.changes.length > 3 ? ', …' : ''})`,
          ),
    );
  });
  grid.setOnSelectionChanged((change) => {
    updateToolbarSelectionState(change.selectedRows.length);
    if (selectionSyncInProgress || change.selectedRows.length === 0) return;
    const activeRow =
      change.activeRowIndex == null
        ? change.selectedRows[change.selectedRows.length - 1]
        : currentRows[change.activeRowIndex];
    const selection = activeRow ? provider.selectionForRow?.(activeRow) : undefined;
    if (!selection) return;
    selectionSyncInProgress = true;
    currentSelection = selection;
    viewer.setSelection(selection, false);
    delete byId('selection-info-panel').dataset.dismissed;
    renderSelectionInfo(selection);
    results.syncSelection();
    selectionSyncInProgress = false;
  });
  const search = byId<HTMLInputElement>('grid-search').value;
  if (search) grid.setSearchQuery(search);
  currentGrid = grid;
  syncGridToViewerSelection(currentSelection);
  updateFilterState();
}

function updateToolbarSelectionState(selectedCount: number): void {
  const remove = document.getElementById('btn-delete-row') as HTMLButtonElement | null;
  const changeNumber = document.getElementById('btn-change-number') as HTMLButtonElement | null;
  if (remove) remove.disabled = selectedCount === 0;
  if (changeNumber) changeNumber.disabled = selectedCount !== 1;
}

function addRow(): void {
  const provider = activeProvider();
  if (!provider?.add) return;
  const created = mutateDocument('Add row', provider.add);
  if (!created) {
    notify('error', localText('追加に必要な参照先がありません。', 'Required referenced entities are missing.'));
    return;
  }
  refreshGrid();
  const index = currentRows.indexOf(created);
  if (index >= 0) currentGrid?.selectRow(index, { scroll: true, focus: true });
  const number = (created as { number?: number; nodeNumber?: number }).number ?? (created as { nodeNumber?: number }).nodeNumber;
  notify(
    'success',
    localText(
      `${t(tabDefs.find((tab) => tab.id === activeTab)!.i18nKey)}に行を追加しました${number !== undefined ? `（番号 ${number}）` : ''}`,
      `Added a row to ${t(tabDefs.find((tab) => tab.id === activeTab)!.i18nKey)}${number !== undefined ? ` (number ${number})` : ''}`,
    ),
  );
}

async function deleteSelectedRows(): Promise<void> {
  const provider = activeProvider();
  const selected = currentGrid?.getSelectedRows() ?? [];
  if (!provider?.remove || selected.length === 0) return;
  const confirmed = await dialogService.confirm({
    title: t('dialog.deleteTitle'),
    body: t('dialog.deleteBody', selected.length),
    confirmLabel: t('toolbar.deleteRow'),
    cancelLabel: t('dialog.cancel'),
    destructive: true,
  });
  if (!confirmed) {
    notify('cancel', localText('行の削除を取り消しました。', 'Row deletion cancelled.'));
    return;
  }
  let dependencyError: string | null = null;
  mutateDocument('Delete rows', () => {
    dependencyError = provider.remove!(selected);
  });
  if (dependencyError) {
    notify('error', dependencyError);
    return;
  }
  resetViewerSelection();
  refreshGrid();
  notify('success', localText(`${selected.length}行を削除しました。`, `Deleted ${selected.length} row(s).`));
}

function duplicateSelectedRows(): void {
  const provider = activeProvider();
  const selected = currentGrid?.getSelectedRows() ?? [];
  if (!provider?.duplicate || selected.length === 0) {
    notify('error', localText('複製する行を選択してください。', 'Select rows to duplicate.'));
    return;
  }
  const duplicates = mutateDocument('Duplicate rows', () => provider.duplicate!(selected));
  refreshGrid();
  const indices = duplicates.map((item) => currentRows.indexOf(item)).filter((index) => index >= 0);
  currentGrid?.setSelectedRowIndices(indices);
  const first = duplicates[0];
  if (first && provider.selectionForRow) setCurrentSelection(provider.selectionForRow(first), { syncGrid: false });
  const numbers = duplicates.map((item) => (item as { number?: number }).number).filter((number) => number !== undefined);
  notify(
    'success',
    localText(
      `${duplicates.length}行を複製しました${numbers.length ? `（番号 ${numbers.join(', ')}）` : ''}`,
      `Duplicated ${duplicates.length} row(s)${numbers.length ? ` (numbers ${numbers.join(', ')})` : ''}`,
    ),
  );
}

async function changeSelectedNumber(): Promise<void> {
  const provider = activeProvider();
  const selected = currentGrid?.getSelectedRows() ?? [];
  if (!provider?.numberKind || selected.length !== 1) return;
  const row = selected[0] as { number: number };
  const oldNumber = row.number;
  const values = await requestFields(dialogService, localText('番号を変更', 'Change number'), [
    {
      name: 'number',
      label: localText('新しい番号', 'New number'),
      value: String(row.number),
      type: 'number',
      integer: true,
      min: 1,
    },
  ]);
  if (!values) {
    notify('cancel', localText('番号変更を取り消しました。', 'Number change cancelled.'));
    return;
  }
  const newNumber = Number(values.number);
  mutateDocument('Change entity number', () =>
    doc.changeEntityNumber(provider.numberKind!, row.number, newNumber),
  );
  refreshGrid();
  // The row object now carries the new number; re-derive the selection from it (R08).
  setCurrentSelection(provider.selectionForRow?.(row) ?? { kind: 'none' });
  notify(
    'success',
    localText(
      `番号を変更しました: ${oldNumber} → ${row.number}（参照先も更新）`,
      `Changed number ${oldNumber} → ${row.number} (references updated)`,
    ),
  );
}

function setupViewer(): void {
  viewer = new ModelViewer(byId('viewer-panel'), doc);
  viewer.setOnSelectionChanged((selection) => {
    currentSelection = selection;
    // An explicit pick in the view re-opens a dismissed info panel.
    delete byId('selection-info-panel').dataset.dismissed;
    renderSelectionInfo(selection);
    results.syncSelection();
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
    updateStatus(
      localText('先に節点・部材・壁を選択してください。', 'Select a node, member, or wall first.'),
    );
    return;
  }
  const next = viewer.getDrawingMode() === mode ? 'none' : mode;
  viewer.setDrawingMode(next);
  updateViewerToggleStates();
  updateDrawingHint();
  if (next !== 'none') {
    drawingPanel.show();
    viewer.focus();
  } else drawingPanel.hide();
}

function updateDrawingHint(): void {
  if (!viewer) return;
  const next = viewer.getDrawingMode();
  const hint = byId('drawing-hint');
  hint.classList.toggle('hidden', next === 'none');
  const pointerHint =
    next === 'node'
      ? t('draw.nodeHint')
      : next === 'member'
        ? t('draw.memberHint')
        : next === 'move'
          ? currentSelection.kind === 'node'
            ? localText(
                '節点の移動先をクリックします。Escで終了します。',
                'Click the destination for the node. Press Escape to finish.',
              )
            : localText(
                '構成節点の移動先をクリックします。共有節点に接続する他要素も追従します。Escで終了します。',
                'Click the destination for the constituent nodes. Other entities connected to shared nodes will follow. Press Escape to finish.',
              )
          : next === 'duplicate'
            ? localText(
                '選択要素の複製先をクリックします。Escで終了します。',
                'Click the destination for a duplicate. Press Escape to finish.',
              )
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
  setPressed('menu-local-axes', viewer.getLocalAxesVisible());
  setPressed('view-results', layers.results && viewer.getAnalysisResults() !== null);
}

function handleDrawingEvent(event: DrawingEvent): void {
  if (event.type === 'cancel') {
    viewer.setDrawingMode('none');
    byId('drawing-hint').classList.add('hidden');
    drawingPanel.hide();
    updateViewerToggleStates();
    notify('cancel', localText('作図を取り消しました。', 'Drawing cancelled.'));
    return;
  }
  if (event.type === 'selection-move') {
    transformSelection(event.selection, event.target, event.duplicate);
    return;
  }
  if (event.type === 'member-start') {
    byId('drawing-hint').textContent = localText(
      '終点をクリックしてください。',
      'Click the member end point.',
    );
    drawingPanel.syncMode();
    return;
  }
  if (event.type === 'node-create') {
    if (event.existingNodeNumber) {
      notify('info', localText(`節点 ${event.existingNodeNumber} が既にあります。`, `Node ${event.existingNodeNumber} already exists there.`));
      return;
    }
    const node = mutateDocument('Draw node', () => doc.addNode(doc.createNode(...event.position)));
    showTab('nodes');
    setCurrentSelection({ kind: 'node', nodeNumber: node.number });
    notify(
      'success',
      localText(
        `節点 ${node.number} を (${event.position.map((value) => Math.round(value * 1000) / 1000).join(', ')}) に作図しました`,
        `Drew node ${node.number} at (${event.position.map((value) => Math.round(value * 1000) / 1000).join(', ')})`,
      ),
    );
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
      if (!start || !end || start.number === end.number)
        throw new Error(localText('部材には異なる2節点が必要です。', 'A member requires two distinct nodes.'));
      const created = doc.createMember();
      created.iNodeNumber = start.number;
      created.jNodeNumber = end.number;
      created.sectionNumber = ensureDefaultSection().number;
      return doc.addMember(created);
    });
    showTab('members');
    setCurrentSelection({ kind: 'member', memberNumber: member.number });
    drawingPanel.syncMode();
    notify(
      'success',
      localText(
        `部材 ${member.number}（節点 ${member.iNodeNumber} → ${member.jNodeNumber}）を作図しました`,
        `Drew member ${member.number} (nodes ${member.iNodeNumber} → ${member.jNodeNumber})`,
      ),
    );
  }
}

function transformSelection(
  selection: Exclude<ViewerSelection, { kind: 'none' }>,
  target: [number, number, number],
  duplicate: boolean,
): void {
  const sourceNodeNumbers =
    selection.kind === 'node'
      ? [selection.nodeNumber]
      : selection.kind === 'member'
        ? (() => {
            const member = doc.findMemberByNumber(selection.memberNumber);
            return member ? [member.iNodeNumber, member.jNodeNumber] : [];
          })()
        : (() => {
            const wall = doc.walls.find((item) => item.number === selection.wallNumber);
            return wall
              ? [wall.leftBottomNode, wall.rightBottomNode, wall.leftTopNode, wall.rightTopNode]
              : [];
          })();
  const sourceNodes = [...new Set(sourceNodeNumbers)]
    .map((number) => doc.findNodeByNumber(number))
    .filter((node): node is Node => node !== undefined);
  if (sourceNodes.length === 0) {
    notify(
      'error',
      localText('移動または複製する要素が見つかりません。', 'The selected entity is no longer available.'),
    );
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
      ? sourceNodes.map((node) => {
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
    const replacementByNodeNumber = new Map(
      sourceNodes.map((node, index) => [node.number, movedNodes[index].number]),
    );
    if (selection.kind === 'node') {
      nextSelection = { kind: 'node', nodeNumber: movedNodes[0].number };
    } else if (selection.kind === 'member' && duplicate) {
      const source = doc.findMemberByNumber(selection.memberNumber);
      if (!source) throw new Error('The selected member no longer exists.');
      const copy = cloneMember(source);
      copy.iNodeNumber = replacementByNodeNumber.get(source.iNodeNumber) ?? source.iNodeNumber;
      copy.jNodeNumber = replacementByNodeNumber.get(source.jNodeNumber) ?? source.jNodeNumber;
      for (const link of doc.analysisMetadata?.linkElements.filter((item) => item.tag === copy.number) ??
        []) {
        link.nodeI = copy.iNodeNumber;
        link.nodeJ = copy.jNodeNumber;
      }
      nextSelection = { kind: 'member', memberNumber: copy.number };
    } else if (selection.kind === 'wall' && duplicate) {
      const source = doc.walls.find((item) => item.number === selection.wallNumber);
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

  viewer.setDrawingMode('none');
  byId('drawing-hint').classList.add('hidden');
  drawingPanel.hide();
  updateViewerToggleStates();
  const tabId =
    nextSelection.kind === 'node' ? 'nodes' : nextSelection.kind === 'member' ? 'members' : 'walls';
  showTab(tabId);
  setCurrentSelection(nextSelection);
  const describe = (item: ViewerSelection): string =>
    item.kind === 'node'
      ? `${localText('節点', 'node')} ${item.nodeNumber}`
      : item.kind === 'member'
        ? `${localText('部材', 'member')} ${item.memberNumber}`
        : item.kind === 'wall'
          ? `${localText('壁', 'wall')} ${item.wallNumber}`
          : '';
  notify(
    'success',
    duplicate
      ? localText(
          `${describe(selection)} を複製しました → ${describe(nextSelection)}（Δ ${delta.map((value) => Math.round(value * 1000) / 1000).join(', ')} cm）`,
          `Duplicated ${describe(selection)} → ${describe(nextSelection)} (Δ ${delta.map((value) => Math.round(value * 1000) / 1000).join(', ')} cm)`,
        )
      : selection.kind === 'node'
        ? localText(`節点 ${selection.nodeNumber} を移動しました。`, `Moved node ${selection.nodeNumber}.`)
        : localText(
            `${describe(selection)} の構成節点を移動しました。共有節点に接続する要素も追従しています。`,
            `Moved the nodes of ${describe(selection)}; entities connected to shared nodes followed.`,
          ),
  );
}

function setupSelectionPanel(): void {
  // "×" only hides the panel; "Clear selection" also deselects (R17).
  on('selection-info-close', () => {
    byId('selection-info-panel').classList.add('hidden');
    byId('selection-info-panel').dataset.dismissed = 'true';
  });
  on('selection-info-clear', () => {
    resetViewerSelection();
    notify('info', localText('選択を解除しました。', 'Selection cleared.'));
  });
}

function resetViewerSelection(): void {
  currentSelection = { kind: 'none' };
  viewer.clearSelection(false);
  currentGrid?.clearSelection(false);
  renderSelectionInfo(currentSelection);
  results.syncSelection();
}

/** Resolves a selection against the model; entities that no longer exist yield `none`. */
function resolveSelection(selection: ViewerSelection): ViewerSelection {
  if (selection.kind === 'node' && !doc.findNodeByNumber(selection.nodeNumber)) return { kind: 'none' };
  if (selection.kind === 'member' && !doc.findMemberByNumber(selection.memberNumber)) return { kind: 'none' };
  if (selection.kind === 'wall' && !doc.walls.some((wall) => wall.number === selection.wallNumber))
    return { kind: 'none' };
  return selection;
}

/**
 * Single entry point for selection changes made by the application (number
 * changes, duplicates, drawing, undo). Keeps the viewer, the info panel, the
 * grid row and the results values in sync (R08).
 */
function setCurrentSelection(
  selection: ViewerSelection,
  options: { syncGrid?: boolean; switchTab?: boolean } = {},
): void {
  const resolved = resolveSelection(selection);
  currentSelection = resolved;
  viewer.setSelection(resolved, false);
  renderSelectionInfo(resolved);
  results.syncSelection();
  if (options.syncGrid !== false) syncGridToViewerSelection(resolved, options.switchTab ?? false);
}

function syncGridToViewerSelection(selection: ViewerSelection, switchTab = false): void {
  const tabId =
    selection.kind === 'node'
      ? 'nodes'
      : selection.kind === 'member'
        ? 'members'
        : selection.kind === 'wall'
          ? 'walls'
          : null;
  if (!tabId) {
    currentGrid?.clearSelection(false);
    return;
  }
  if (switchTab && activeTab !== tabId) showTab(tabId);
  const provider = activeProvider();
  const index = provider?.indexForSelection?.(currentRows, selection) ?? -1;
  selectionSyncInProgress = true;
  if (index >= 0) {
    currentGrid?.selectRow(index, { scroll: true, notify: false });
    currentGrid?.setActiveCell(index, 0);
  } else currentGrid?.clearSelection(false);
  selectionSyncInProgress = false;
}

function renderSelectionInfo(selection: ViewerSelection): void {
  const panel = byId('selection-info-panel');
  const previousKey = panel.dataset.selectionKey ?? '';
  const key =
    selection.kind === 'node'
      ? `node:${selection.nodeNumber}`
      : selection.kind === 'member'
        ? `member:${selection.memberNumber}`
        : selection.kind === 'wall'
          ? `wall:${selection.wallNumber}`
          : '';
  renderSelectionPanel(doc, selection);
  panel.dataset.selectionKey = key;
  // A panel the user dismissed stays hidden until a different entity is selected.
  if (panel.dataset.dismissed === 'true' && key && key === previousKey) panel.classList.add('hidden');
  else delete panel.dataset.dismissed;
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
    const nextIndex = Number(selector.value);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= doc.loadCaseCount) return;
    setActiveLoadCaseIndex(nextIndex);
    notify(
      'info',
      localText(
        `表示する荷重ケース: ${describeLoadCase(doc, doc.loadCases[nextIndex].id)}`,
        `Displayed load case: ${describeLoadCase(doc, doc.loadCases[nextIndex].id)}`,
      ),
    );
    void loadCasePanel.onActiveCaseChanged().catch(reportError);
  };
}

/** Switches the displayed load case (view state, not a history entry) and keeps every view in step. */
function setActiveLoadCaseIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= doc.loadCaseCount) return;
  doc.loadCaseIndex = index;
  viewer.setLoadCase(index);
  const selector = document.getElementById('load-case-selector') as HTMLSelectElement | null;
  if (selector) selector.value = String(index);
  refreshGrid();
  updateModelSummary();
}

async function addLoadCase(): Promise<void> {
  const values = await requestFields(dialogService, localText('荷重ケースを追加', 'Add load case'), [
    { name: 'name', label: localText('名前', 'Name'), value: `Load Case ${doc.loadCaseCount + 1}` },
    {
      name: 'type',
      label: localText('種別', 'Type'),
      type: 'select',
      value: LoadCaseType.Other,
      options: Object.values(LoadCaseType).map((value) => ({ value, label: value })),
    },
    { name: 'memo', label: localText('メモ', 'Memo'), type: 'textarea' },
  ]);
  if (!values) {
    notify('cancel', localText('荷重ケースの追加を取り消しました。', 'Load case addition cancelled.'));
    return;
  }
  const created = mutateDocument('Add load case', () => {
    const loadCase = doc.addLoadCase({ name: values.name, type: values.type, memo: values.memo });
    doc.loadCaseIndex = doc.loadCaseCount - 1;
    return loadCase;
  });
  updateLoadCaseSelector();
  void loadCasePanel.onActiveCaseChanged().catch(reportError);
  notify('success', localText(`荷重ケースを追加しました: ${describeLoadCase(doc, created.id)}`, `Added load case ${describeLoadCase(doc, created.id)}`));
}

function duplicateLoadCase(): void {
  const copy = mutateDocument('Duplicate load case', () => {
    const sourceIndex = doc.loadCaseIndex;
    const loadCase = doc.duplicateLoadCase(sourceIndex);
    doc.loadCaseIndex = sourceIndex + 1;
    return loadCase;
  });
  updateLoadCaseSelector();
  void loadCasePanel.onActiveCaseChanged().catch(reportError);
  notify('success', localText(`荷重ケースを複製しました: ${describeLoadCase(doc, copy.id)}`, `Duplicated load case → ${describeLoadCase(doc, copy.id)}`));
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
  if (!confirmed) {
    notify('cancel', localText('荷重ケースの削除を取り消しました。', 'Load case deletion cancelled.'));
    return;
  }
  const label = describeLoadCase(doc, current.id);
  mutateDocument('Remove load case', () => doc.removeLoadCase(doc.loadCaseIndex));
  updateLoadCaseSelector();
  refreshGrid();
  void loadCasePanel.onActiveCaseChanged().catch(reportError);
  notify('success', localText(`荷重ケース ${label} を削除しました`, `Deleted load case ${label}`));
}

function showValidationPanel(): void {
  const result = validateFrameDocument(doc);
  const content = createElement('div');
  content.appendChild(
    createElement(
      'p',
      undefined,
      localText(
        `エラー ${result.errorCount} / 警告 ${result.warningCount} / 情報 ${result.infoCount}`,
        `Errors ${result.errorCount} / Warnings ${result.warningCount} / Info ${result.infoCount}`,
      ),
    ),
  );
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
    const tabByKind: Record<string, string> = {
      material: 'materials',
      section: 'sections',
      spring: 'springs',
    };
    const tab = tabByKind[kind];
    if (!tab) return;
    showTab(tab);
    const index = currentRows.findIndex((row) => (row as { number?: number }).number === number);
    if (index >= 0) currentGrid?.selectRow(index, { scroll: true, focus: true });
  }
}

function showModelInfoPanel(): void {
  modelInfo();
}

function showSectionCalculator(): void {
  sectionCalculator();
}

function invalidateAnalysisResults(): boolean {
  return results.invalidate();
}
function showResultsPanel(): void {
  results.show();
}

function refreshDocumentUi(fitToView: boolean): void {
  viewer.setLoadCase(doc.loadCaseIndex);
  viewer.updateModel(fitToView);
  refreshGrid();
  updateLoadCaseSelector();
  renderSelectionInfo(currentSelection);
  results.syncSelection();
  updateDirtyUi();
  updateModelSummary();
  updateViewerToggleStates();
  toolPanel.notifyModelChanged();
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
  notify('info', message);
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
  handle.addEventListener('pointerdown', (event) => {
    startPosition = stackedQuery.matches ? event.clientY : event.clientX;
    startSize = stackedQuery.matches ? panel.offsetHeight : panel.offsetWidth;
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    if (stackedQuery.matches) {
      const height = Math.max(180, startSize + startPosition - event.clientY);
      panel.style.flexBasis = `${height}px`;
    } else {
      panel.style.flexBasis = `${Math.max(MIN_DATA_PANEL_WIDTH, startSize + startPosition - event.clientX)}px`;
    }
    viewer.resize();
  });
  handle.addEventListener('pointerup', (event) => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    viewer.resize();
  });
  handle.addEventListener('keydown', (event) => {
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
  document.addEventListener('keydown', (event) => {
    const applicationDialog = byId<HTMLDialogElement>('app-dialog');
    if (!byId('help-overlay').classList.contains('hidden') || applicationDialog.open) return;
    const target = event.target;
    const editing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    // A grid cell that has been committed (Enter/Tab) is in navigation mode: Undo/Redo
    // then apply to the model, not to the text field (R06).
    const inCommittedGridCell =
      editing &&
      target instanceof HTMLElement &&
      target.classList.contains('data-grid-editor') &&
      currentGrid !== null &&
      !currentGrid.isEditing();
    const textEditing = editing && !inCommittedGridCell;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveJson();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      void openFilePicker();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      if (textEditing) return;
      event.preventDefault();
      undo();
    } else if (
      (event.ctrlKey || event.metaKey) &&
      (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))
    ) {
      if (textEditing) return;
      event.preventDefault();
      redo();
    } else if (event.key === 'Delete' && !editing) {
      event.preventDefault();
      void deleteSelectedRows();
    } else if (event.key === 'Escape') {
      viewer.setDrawingMode('none');
      drawingPanel.hide();
      toolPanel.close();
      resetViewerSelection();
      byId('drawing-hint').classList.add('hidden');
      updateViewerToggleStates();
    } else if (event.key.toLowerCase() === 'f' && !editing) {
      viewer.fitToView();
    }
  });
}

const createNewDocument = (...args: Parameters<typeof files.createNewDocument>) =>
  files.createNewDocument(...args);

const confirmDiscardChanges = (...args: Parameters<typeof files.confirmDiscardChanges>) =>
  files.confirmDiscardChanges(...args);

const openFilePicker = (...args: Parameters<typeof files.openFilePicker>) => files.openFilePicker(...args);

const saveJson = (...args: Parameters<typeof files.saveJson>) => files.saveJson(...args);

const exportYaml = (...args: Parameters<typeof files.exportYaml>) => files.exportYaml(...args);

const exportCurrentGridCsv = (...args: Parameters<typeof files.exportCurrentGridCsv>) =>
  files.exportCurrentGridCsv(...args);

const loadSample = (...args: Parameters<typeof files.loadSample>) => files.loadSample(...args);

const showImportReport = (...args: Parameters<typeof files.showImportReport>) =>
  files.showImportReport(...args);
