// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { DialogService } from '../../src/app/DialogService';
import { EditorController } from '../../src/app/EditorController';
import { createLoadCasePanel, describeLoadCase, LOAD_CASE_PANEL_ID } from '../../src/app/LoadCasePanel';
import { ToolPanel } from '../../src/app/ToolPanel';
import { FrameDocument } from '../../src/models/FrameDocument';
import { DocumentHistory } from '../../src/services/DocumentHistory';
import {
  buttonByText,
  chooseDialog,
  dialogIsOpen,
  flush,
  installDomPolyfills,
  mountPanelMarkup,
  setValue,
} from './support/dom';

function setup() {
  installDomPolyfills();
  mountPanelMarkup();
  const doc = new FrameDocument();
  const history = new DocumentHistory(doc, { trustChangeNotifications: true });
  const editor = new EditorController(doc, history);
  const toolPanel = new ToolPanel();
  const dialogService = new DialogService();
  const notifications: Array<[string, string]> = [];
  const activeIndexChanges: number[] = [];
  const mutate = <T>(label: string, action: () => T): T => {
    const value = editor.execute(label, action);
    toolPanel.notifyModelChanged();
    return value;
  };
  const panel = createLoadCasePanel({
    doc,
    dialogService,
    toolPanel,
    mutateDocument: mutate,
    setActiveLoadCaseIndex: (index) => {
      doc.loadCaseIndex = index;
      activeIndexChanges.push(index);
    },
    notify: (kind, message) => notifications.push([kind, message]),
  });
  doc.addLoadCase({ name: 'CUA Wind', type: 'wind', memo: '動作確認用' });
  doc.loadCaseIndex = 1;
  const body = document.getElementById('tool-panel-body')!;
  const input = (name: string) => body.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  return { doc, history, toolPanel, panel, notifications, activeIndexChanges, body, input };
}

describe('LoadCasePanel (R01)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the edited case with its number, name and ID and follows the current-case selector', async () => {
    const { doc, panel, toolPanel, body, input, notifications } = setup();
    panel.show();
    expect(toolPanel.currentId).toBe(LOAD_CASE_PANEL_ID);
    const target = body.querySelector<HTMLElement>('#load-case-edit-target')!;
    expect(target.textContent).toContain('2: CUA Wind (LC2)');
    expect(target.dataset.loadCaseId).toBe('LC2');
    expect(input('load-case-name').value).toBe('CUA Wind');
    expect(input('load-case-type').value).toBe('wind');

    doc.loadCaseIndex = 0;
    await panel.onActiveCaseChanged();
    expect(target.textContent).toContain('1: Load Case 1 (LC1)');
    expect(input('load-case-name').value).toBe('Load Case 1');

    setValue(input('load-case-name'), 'EditedWhileLC1');
    buttonByText(body, 'ケース情報を更新').click();
    await flush();
    expect(doc.loadCases[0].name).toBe('EditedWhileLC1');
    expect(doc.loadCases[1].name).toBe('CUA Wind');
    expect(notifications.at(-1)![0]).toBe('success');
    expect(notifications.at(-1)![1]).toContain('1: EditedWhileLC1 (LC1)');
  });

  it('offers save / discard / cancel for unsaved edits when the case switches', async () => {
    const { doc, panel, body, input, activeIndexChanges, notifications } = setup();
    panel.show();
    const badge = () => body.querySelector<HTMLElement>('#load-case-edit-target .panel-badge');
    expect(badge()).not.toBeNull();
    expect(badge()!.classList.contains('hidden')).toBe(true);
    setValue(input('load-case-name'), 'Pending');
    expect(body.querySelector('#load-case-edit-target')!.getAttribute('data-dirty')).toBe('true');
    expect(badge()!.isConnected).toBe(true);
    expect(badge()!.classList.contains('hidden')).toBe(false);

    doc.loadCaseIndex = 0;
    const switching = panel.onActiveCaseChanged();
    await flush();
    expect(dialogIsOpen()).toBe(true);
    await chooseDialog('save');
    await switching;
    expect(doc.loadCases[1].name).toBe('Pending');
    expect(panel.getEditingCaseId()).toBe('LC1');

    setValue(input('load-case-name'), 'Second');
    doc.loadCaseIndex = 1;
    const cancelling = panel.onActiveCaseChanged();
    await flush();
    (document.querySelector('#app-dialog-actions button[value="cancel"]') as HTMLButtonElement).click();
    await cancelling;
    expect(activeIndexChanges.at(-1)).toBe(0);
    expect(panel.getEditingCaseId()).toBe('LC1');
    expect(doc.loadCases[0].name).toBe('Load Case 1');
    expect(notifications.at(-1)![0]).toBe('cancel');

    doc.loadCaseIndex = 1;
    const discarding = panel.onActiveCaseChanged();
    await flush();
    await chooseDialog('discard');
    await discarding;
    expect(doc.loadCases[0].name).toBe('Load Case 1');
    expect(panel.getEditingCaseId()).toBe('LC2');
    expect(input('load-case-name').value).toBe('Pending');
  });

  it('re-targets the current case when the edited case is removed and keeps the name in sync after undo', async () => {
    const { doc, history, panel, toolPanel, body, input } = setup();
    panel.show();
    doc.removeLoadCase(1);
    toolPanel.notifyModelChanged();
    expect(panel.getEditingCaseId()).toBe('LC1');
    expect(body.querySelector('#load-case-edit-target')!.textContent).toContain('(LC1)');
    setValue(input('load-case-name'), 'Renamed');
    buttonByText(body, 'ケース情報を更新').click();
    await flush();
    expect(doc.loadCases[0].name).toBe('Renamed');
    history.undo();
    toolPanel.notifyModelChanged();
    expect(input('load-case-name').value).toBe('Load Case 1');
  });
});

describe('LoadCasePanel with imported type strings (review fix)', () => {
  it('keeps a non-standard type selectable and does not report phantom edits', async () => {
    const { doc, panel, input } = setup();
    doc.loadCases[0].type = 'snow';
    panel.show();
    doc.loadCaseIndex = 0;
    await panel.onActiveCaseChanged();
    expect(input('load-case-type').value).toBe('snow');
    expect(panel.isCaseFormDirty()).toBe(false);
    doc.loadCaseIndex = 1;
    await panel.onActiveCaseChanged();
    await flush();
    expect(dialogIsOpen()).toBe(false);
    expect(panel.getEditingCaseId()).toBe('LC2');
    expect(doc.loadCases[0].type).toBe('snow');
  });
});

describe('Load combination editor (R13)', () => {
  it('builds combinations from case rows with factors, then edits and duplicates them', async () => {
    const { doc, panel, body, notifications } = setup();
    panel.show();
    const form = () => body.querySelector<HTMLElement>('#load-combination-form')!;
    setValue(form().querySelector<HTMLInputElement>('[name="combination-name"]')!, '長期');
    buttonByText(form(), 'ケース行を追加').click();
    await flush();
    const selects = form().querySelectorAll<HTMLSelectElement>('select');
    expect(selects).toHaveLength(2);
    expect([...selects[0].options].map((option) => option.textContent)).toEqual(['1: Load Case 1 (LC1)', '2: CUA Wind (LC2)']);
    setValue(selects[1], 'LC2');
    setValue(form().querySelector<HTMLInputElement>('[name="term-factor-1"]')!, '0.5');
    expect(form().querySelector<HTMLInputElement>('[name="term-factor-1"]')!.step).toBe('any');
    buttonByText(form(), '組合せを追加').click();
    await flush();
    expect(doc.loadCombinations).toHaveLength(1);
    expect(doc.loadCombinations[0].terms).toEqual([
      { loadCaseId: 'LC1', factor: 1 },
      { loadCaseId: 'LC2', factor: 0.5 },
    ]);
    expect(notifications.at(-1)![1]).toContain('1: Load Case 1 (LC1) × 1');

    buttonByText(body, '編集: 長期').click();
    await flush();
    expect(form().textContent).toContain('組合せを編集: 長期');
    setValue(form().querySelector<HTMLInputElement>('[name="term-factor-1"]')!, '1.5');
    buttonByText(form(), '組合せを更新').click();
    await flush();
    expect(doc.loadCombinations[0].terms[1].factor).toBe(1.5);

    buttonByText(body, '複製: 長期').click();
    await flush();
    expect(doc.loadCombinations).toHaveLength(2);
    expect(doc.loadCombinations[1].name).toBe('長期 Copy');
    expect(describeLoadCase(doc, 'LC2')).toBe('2: CUA Wind (LC2)');
    expect(body.textContent).toContain('固定ID');
  });
});
