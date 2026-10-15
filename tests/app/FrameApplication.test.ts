// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootApplication, gridInput, key, menu } from './support/appHarness';
import {
  buttonByText,
  click,
  confirmDialog,
  dialog,
  dialogIsOpen,
  flush,
  setDialogValue,
  setValue,
  statusKind,
  statusText,
} from './support/dom';

vi.mock('../../src/viewer/ModelViewer', () => import('./support/viewerMock'));

describe('FrameApplication integration (CUA regression)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('R06/R07: undo applies to the model from a committed cell, and notifications carry their kind', async () => {
    const { doc } = await bootApplication({ lang: 'ja' });
    await click('btn-add-row');
    expect(doc.nodes).toHaveLength(1);
    expect(statusKind()).toBe('success');
    const x = gridInput(0, 'x');
    x.click();
    x.focus();
    x.value = '12.5';
    key(x, { key: 'Enter' });
    await flush();
    expect(doc.nodes[0].x).toBe(12.5);
    expect(statusKind()).toBe('success');
    expect(statusText()).toContain('x=12.5');
    const committed = gridInput(0, 'x');
    committed.focus();
    key(committed, { key: 'z', metaKey: true });
    await flush();
    expect(doc.nodes[0].x).toBe(0);
    expect(statusText()).toContain('元に戻しました');
    key(gridInput(0, 'x'), { key: 'z', metaKey: true, shiftKey: true });
    await flush();
    expect(doc.nodes[0].x).toBe(12.5);
  });

  it('R06 review fix: Ctrl/Cmd+Z during IME composition or deletion stays a text undo', async () => {
    const { doc } = await bootApplication({ lang: 'ja' });
    await click('btn-add-row');
    expect(doc.nodes).toHaveLength(1);
    const cell = gridInput(0, 'x');
    cell.focus();
    cell.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    key(cell, { key: 'z', ctrlKey: true });
    await flush();
    expect(doc.nodes).toHaveLength(1);

    await click('btn-add-row');
    const other = gridInput(1, 'x');
    other.focus();
    other.value = '';
    other.dispatchEvent(new Event('input', { bubbles: true }));
    key(other, { key: 'z', metaKey: true });
    await flush();
    expect(doc.nodes).toHaveLength(2);
  });

  it('R07: a later success replaces an earlier error (frame template)', async () => {
    const { doc } = await bootApplication({ lang: 'ja' });
    await menu('menu-frame-template');
    await flush();
    expect(statusKind()).toBe('error');
    expect(statusText()).toContain('先に断面');
    const errorSequence = document.getElementById('status-text')!.dataset.sequence;
    await click('tab-sections');
    await click('btn-add-row');
    expect(doc.sections).toHaveLength(1);
    await menu('menu-frame-template');
    await flush();
    expect(dialogIsOpen()).toBe(true);
    setDialogValue('spans', '1');
    setDialogValue('stories', '1');
    await confirmDialog();
    await flush();
    expect(doc.nodes).toHaveLength(4);
    expect(statusKind()).toBe('success');
    expect(statusText()).toContain('骨組を生成しました');
    expect(document.getElementById('status-text')!.dataset.sequence).not.toBe(errorSequence);
  });

  it('R05: pattern copy accepts 12.5 cm from the menu', async () => {
    const { doc, app } = await bootApplication({ lang: 'ja' });
    await click('btn-add-row');
    app.getGrid()!.selectRow(0);
    await menu('menu-pattern');
    await flush();
    setDialogValue('x', '12.5');
    expect(dialog().querySelector<HTMLInputElement>('[name="x"]')!.validity.stepMismatch).toBe(false);
    await confirmDialog();
    await flush();
    expect(doc.nodes).toHaveLength(2);
    expect(doc.nodes[1].x).toBe(12.5);
    expect(statusKind()).toBe('success');
  });

  it('R01: switching the current load case re-targets the open load case panel', async () => {
    const { doc, app } = await bootApplication({ lang: 'ja' });
    await menu('menu-add-loadcase');
    await flush();
    setDialogValue('name', 'CUA Wind');
    setDialogValue('type', 'wind');
    await confirmDialog();
    await flush();
    expect(doc.loadCaseIndex).toBe(1);
    await menu('menu-load-combinations');
    expect(document.getElementById('load-case-edit-target')!.textContent).toContain('2: CUA Wind (LC2)');
    const selector = document.getElementById('load-case-selector') as HTMLSelectElement;
    selector.value = '0';
    selector.dispatchEvent(new Event('change'));
    await flush();
    expect(doc.loadCaseIndex).toBe(0);
    expect(document.getElementById('load-case-edit-target')!.textContent).toContain('1: Load Case 1 (LC1)');
    setValue(document.querySelector<HTMLInputElement>('[name="load-case-name"]')!, 'EditedWhileLC1');
    await click('load-case-update');
    await flush();
    expect(doc.loadCases[0].name).toBe('EditedWhileLC1');
    expect(doc.loadCases[1].name).toBe('CUA Wind');
    expect(app.loadCasePanel.getEditingCaseId()).toBe('LC1');
  });

  it('R02: the model information panel follows edits made while it is open', async () => {
    const { doc } = await bootApplication({ lang: 'ja' });
    await click('btn-add-row');
    await menu('menu-model-info');
    const nodesRow = () =>
      [...document.querySelectorAll<HTMLTableRowElement>('#model-info-statistics tr')].find((row) => row.cells[0].textContent === '節点')!
        .cells[1].textContent;
    expect(nodesRow()).toBe('1');
    await click('btn-add-row');
    expect(doc.nodes).toHaveLength(2);
    expect(nodesRow()).toBe('2');
    const x = gridInput(1, 'x');
    x.click();
    x.value = '100';
    key(x, { key: 'Enter' });
    await flush();
    expect(document.getElementById('model-info-statistics')!.dataset.revision).toBe(String(doc.revision));
  });

  it('R04: a section added while the calculator is open becomes selectable but is not applied implicitly', async () => {
    const { doc } = await bootApplication({ lang: 'ja' });
    await menu('menu-section-calculator');
    const target = () => document.getElementById('section-calculator-target') as HTMLSelectElement;
    expect(target().options).toHaveLength(1);
    await click('tab-sections');
    await click('btn-add-row');
    expect(target().options).toHaveLength(2);
    expect(target().value).toBe('');
    expect((document.getElementById('section-calculator-apply') as HTMLButtonElement).disabled).toBe(true);
    await click('section-calculator-apply');
    expect(doc.sections[0].p1_A).toBe(1);
    setValue(target(), '1');
    expect((document.getElementById('section-calculator-apply') as HTMLButtonElement).disabled).toBe(false);
    await click('section-calculator-apply');
    expect(doc.sections[0].p1_A).toBe(100);
    expect(statusKind()).toBe('success');
    expect(statusText()).toContain('断面 1');
  });

  it('R08: number changes and duplicates keep the selection panel and grid in step', async () => {
    const { doc, app, viewer } = await bootApplication({ lang: 'ja' });
    await click('btn-add-row');
    app.getGrid()!.selectRow(0);
    await click('btn-change-number');
    await flush();
    setDialogValue('number', '901');
    await confirmDialog();
    await flush();
    expect(doc.nodes[0].number).toBe(901);
    expect(app.getSelection()).toEqual({ kind: 'node', nodeNumber: 901 });
    expect(document.getElementById('selection-info-body')!.textContent).toContain('901');
    expect(app.getGrid()!.getSelectedRows()[0]).toBe(doc.nodes[0]);

    viewer.emitDrawingEvent({ type: 'selection-move', selection: { kind: 'node', nodeNumber: 901 }, target: [50, 0, 0], duplicate: true });
    await flush();
    expect(doc.nodes).toHaveLength(2);
    expect(app.getSelection()).toEqual({ kind: 'node', nodeNumber: doc.nodes[1].number });
    expect(document.getElementById('selection-info-body')!.textContent).toContain(String(doc.nodes[1].number));
    expect(app.getGrid()!.getSelectedRows()[0]).toBe(doc.nodes[1]);
    expect(statusText()).toContain('複製しました');

    await menu('menu-undo');
    await flush();
    expect(doc.nodes).toHaveLength(1);
    expect(app.getSelection()).toEqual({ kind: 'none' });
    expect(document.getElementById('selection-info-panel')!.classList.contains('hidden')).toBe(true);
  });

  it('R09: filter state is shown and reset for a new model; layout can be maximized', async () => {
    const { doc } = await bootApplication({ lang: 'ja' });
    await click('btn-add-row');
    await click('btn-add-row');
    setValue(document.getElementById('grid-search') as HTMLInputElement, '2');
    const filter = document.getElementById('grid-filter-state')!;
    expect(filter.textContent).toContain('「2」');
    expect(filter.dataset.visible).toBe('1');
    expect(filter.dataset.total).toBe('2');
    await menu('menu-new');
    await flush();
    await confirmDialog();
    await flush();
    expect(doc.nodes).toHaveLength(0);
    expect((document.getElementById('grid-search') as HTMLInputElement).value).toBe('');
    expect(filter.textContent).toBe('');

    expect(document.getElementById('tab-select')).toBeTruthy();
    (document.getElementById('tab-select') as HTMLSelectElement).value = 'memberloads';
    document.getElementById('tab-select')!.dispatchEvent(new Event('change'));
    expect(document.getElementById('tab-memberloads')!.classList.contains('active')).toBe(true);

    await click('btn-maximize-data');
    expect(document.getElementById('main-content')!.classList.contains('data-maximized')).toBe(true);
    expect(document.getElementById('btn-maximize-data')!.getAttribute('aria-pressed')).toBe('true');
    await click('btn-maximize-view');
    expect(document.getElementById('main-content')!.classList.contains('data-maximized')).toBe(false);
    expect(document.getElementById('main-content')!.classList.contains('view-maximized')).toBe(true);
    await click('btn-maximize-view');
    expect(document.getElementById('main-content')!.dataset.layout).toBe('none');
  });

  it('R16/R17: local axes expose aria-pressed and the info panel separates hide from clear', async () => {
    const { app, viewer } = await bootApplication({ lang: 'ja' });
    await click('btn-add-row');
    await menu('menu-local-axes');
    expect(document.getElementById('menu-local-axes')!.getAttribute('aria-pressed')).toBe('true');
    await menu('menu-local-axes');
    expect(document.getElementById('menu-local-axes')!.getAttribute('aria-pressed')).toBe('false');

    viewer.emitSelection({ kind: 'node', nodeNumber: 1 });
    const panel = document.getElementById('selection-info-panel')!;
    expect(panel.classList.contains('hidden')).toBe(false);
    await click('selection-info-close');
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(app.getSelection()).toEqual({ kind: 'node', nodeNumber: 1 });
    await click('selection-info-clear');
    expect(app.getSelection()).toEqual({ kind: 'none' });
    viewer.emitSelection({ kind: 'node', nodeNumber: 1 });
    expect(panel.classList.contains('hidden')).toBe(false);
  });

  it('R18: switching language localizes menus, recovery status and dialog buttons', async () => {
    await bootApplication({ lang: 'ja' });
    expect(document.getElementById('menu-import-csv')!.textContent).toBe('CSV入力');
    expect(document.getElementById('recovery-status')!.textContent).toContain('復旧');
    await click('btn-lang');
    expect(document.documentElement.lang).toBe('en');
    expect(document.getElementById('menu-import-csv')!.textContent).toBe('Import CSV');
    expect(document.getElementById('menu-pattern')!.textContent).toBe('Pattern Copy');
    expect(document.getElementById('recovery-status')!.textContent).toContain('Recovery');
    await click('btn-add-row');
    await menu('menu-frame-template');
    await flush();
    expect(statusText()).toContain('Create a section first');
    await click('tab-sections');
    await click('btn-add-row');
    await menu('menu-frame-template');
    await flush();
    expect(dialog().querySelector('#app-dialog-actions button[value="cancel"]')!.textContent).toBe('Cancel');
    expect(buttonByText(dialog(), 'Continue')).toBeTruthy();
    await confirmDialog();
  });

  it('R10: drawing modes open the numeric panel and numeric confirmation creates nodes', async () => {
    const { doc, app } = await bootApplication({ lang: 'ja' });
    await click('view-draw-node');
    expect(app.drawingPanel.isOpen()).toBe(true);
    setValue(document.querySelector<HTMLInputElement>('[name="absolute-x"]')!, '12.5');
    await click('drawing-confirm-absolute');
    await flush();
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].x).toBe(12.5);
    expect(app.getSelection()).toEqual({ kind: 'node', nodeNumber: 1 });
    expect(statusText()).toContain('作図しました');
    expect(document.getElementById('view-draw-node')!.getAttribute('aria-pressed')).toBe('true');
    await click(buttonByText(document.getElementById('drawing-panel-body')!, '作図モードを終了'));
    expect(document.getElementById('view-draw-node')!.getAttribute('aria-pressed')).toBe('false');
    expect(document.getElementById('drawing-hint')!.classList.contains('hidden')).toBe(true);
    expect(app.drawingPanel.isOpen()).toBe(false);
  });
});
