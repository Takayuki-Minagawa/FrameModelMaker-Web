// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { DialogService } from '../../src/app/DialogService';
import { EditorController } from '../../src/app/EditorController';
import { PresetPanel } from '../../src/app/PresetPanel';
import {
  createSectionCalculator,
  localizeSectionError,
  SECTION_CALCULATOR_PANEL_ID,
} from '../../src/app/SectionCalculatorPanel';
import { ToolPanel } from '../../src/app/ToolPanel';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Section, SectionShape } from '../../src/models/Section';
import { DocumentHistory } from '../../src/services/DocumentHistory';
import type { ModelViewer } from '../../src/viewer/ModelViewer';
import { FakeModelViewer } from './support/FakeModelViewer';
import { click, installDomPolyfills, mountPanelMarkup, press, setValue } from './support/dom';

let lastSetup: { history: DocumentHistory; toolPanel: ToolPanel } | null = null;

function setup() {
  installDomPolyfills();
  mountPanelMarkup();
  const doc = new FrameDocument();
  const history = new DocumentHistory(doc, { trustChangeNotifications: true });
  const editor = new EditorController(doc, history);
  const toolPanel = new ToolPanel();
  const dialogService = new DialogService();
  const viewer = new FakeModelViewer(document.getElementById('viewer-panel')!, doc) as unknown as ModelViewer;
  const notifications: Array<[string, string]> = [];
  const mutate = <T>(label: string, action: () => T): T => {
    const value = editor.execute(label, action);
    toolPanel.notifyModelChanged();
    return value;
  };
  const presets = new PresetPanel(doc, viewer, dialogService, toolPanel, mutate);
  let defaultSectionCreated = 0;
  const show = createSectionCalculator({
    doc,
    toolPanel,
    presets,
    ensureDefaultSection: () => {
      defaultSectionCreated++;
      const section = new Section();
      section.number = 1;
      doc.sections.push(section);
      return section;
    },
    mutateDocument: mutate,
    notify: (kind, message) => notifications.push([kind, message]),
  });
  const body = () => document.getElementById('tool-panel-body')!;
  const control = (name: string) => body().querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
  const addSection = (number: number, comment = '') => {
    const section = new Section();
    section.number = number;
    section.comment = comment;
    doc.sections.push(section);
    doc.notifyChange();
    toolPanel.notifyModelChanged();
    return section;
  };
  lastSetup = { history, toolPanel };
  return { doc, toolPanel, show, body, control, addSection, notifications, defaultSectionCreated: () => defaultSectionCreated };
}

describe('SectionCalculatorPanel (R03 / R04)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps result, error and inputs in sync', async () => {
    const { show, body, control, notifications, addSection } = setup();
    addSection(1, 'B1');
    show();
    const result = () => document.getElementById('section-calculator-result')!;
    const error = () => document.getElementById('section-calculator-error')!;
    expect(result().dataset.state).toBe('none');

    setValue(control('shape'), String(SectionShape.Box));
    setValue(control('dimension-1'), '20');
    setValue(control('dimension-2'), '30');
    setValue(control('dimension-3'), '2');
    await press(body(), '計算');
    expect(result().dataset.state).toBe('calculated');
    expect(result().textContent).toContain('A (cm²)');
    expect(result().textContent).toContain('184');
    expect(result().textContent).toContain('箱形');

    setValue(control('dimension-3'), '11');
    expect(result().dataset.state).toBe('stale');
    expect(result().textContent).toContain('前回計算値');

    await press(body(), '計算');
    expect(result().dataset.state).toBe('error');
    expect(result().textContent).not.toContain('184');
    expect(error().classList.contains('hidden')).toBe(false);
    expect(error().textContent).toContain('中空部がありません');
    expect(notifications.at(-1)![0]).toBe('error');

    setValue(control('shape'), String(SectionShape.H_Steel));
    setValue(control('dimension-1'), '30');
    setValue(control('dimension-2'), '15');
    setValue(control('dimension-3'), '1');
    setValue(control('dimension-4'), '1.2');
    await press(body(), '計算');
    expect(result().dataset.state).toBe('calculated');
    expect(error().classList.contains('hidden')).toBe(true);
    expect(error().textContent).toBe('');
    expect(notifications.at(-1)![0]).toBe('success');
  });

  it('follows section additions, removals and renumbering and refuses to apply without a target', async () => {
    const { doc, show, body, control, toolPanel, addSection, notifications, defaultSectionCreated } = setup();
    show();
    expect(toolPanel.currentId).toBe(SECTION_CALCULATOR_PANEL_ID);
    const target = () => control('target-section') as HTMLSelectElement;
    const apply = () => document.getElementById('section-calculator-apply') as HTMLButtonElement;
    expect(target().options).toHaveLength(1);
    expect(target().value).toBe('');
    expect(apply().disabled).toBe(true);

    const section = addSection(1, 'B1');
    expect([...target().options].map((option) => option.value)).toEqual(['', '1']);
    expect(target().value).toBe('');
    expect(apply().disabled).toBe(true);

    await click(apply());
    expect(section.p1_A).toBe(0);
    expect(defaultSectionCreated()).toBe(0);

    setValue(target(), '1');
    expect(apply().disabled).toBe(false);
    doc.changeEntityNumber('section', 1, 7);
    toolPanel.notifyModelChanged();
    expect([...target().options].map((option) => option.value)).toEqual(['', '7']);
    // The renumbered section stays selected (tracked by identity, not by number).
    expect(target().value).toBe('7');
    expect(apply().disabled).toBe(false);

    setValue(control('dimension-1'), '20');
    setValue(control('dimension-2'), '30');
    await click(apply());
    expect(section.p1_A).toBe(600);
    expect(notifications.at(-1)![0]).toBe('success');
    expect(notifications.at(-1)![1]).toContain('断面 7 (B1) へ適用');
    expect(notifications.at(-1)![1]).toContain('A=600 cm²');

    doc.sections.length = 0;
    doc.notifyChange();
    toolPanel.notifyModelChanged();
    expect(target().options).toHaveLength(1);
    expect(apply().disabled).toBe(true);
  });

  it('keeps pointing at the chosen section after a renumber shifts numbers (review fix)', async () => {
    const { doc, show, control, toolPanel, addSection } = setup();
    addSection(1, 'A');
    const chosen = addSection(3, 'B');
    const other = addSection(5, 'C');
    show();
    const target = () => control('target-section') as HTMLSelectElement;
    setValue(target(), '3');
    doc.assignNumbers();
    toolPanel.notifyModelChanged();
    expect(chosen.number).toBe(2);
    expect(other.number).toBe(3);
    expect(target().value).toBe('2');
    setValue(control('dimension-1'), '20');
    setValue(control('dimension-2'), '30');
    await click(document.getElementById('section-calculator-apply')!);
    expect(chosen.p1_A).toBe(600);
    expect(other.p1_A).toBe(0);
  });

  it('keeps the target after undo rebuilds the section objects (review fix)', async () => {
    const { doc, show, control, addSection } = setup();
    addSection(1, 'A');
    addSection(2, 'B');
    show();
    const target = () => control('target-section') as HTMLSelectElement;
    setValue(target(), '2');
    setValue(control('dimension-1'), '20');
    setValue(control('dimension-2'), '30');
    await click(document.getElementById('section-calculator-apply')!);
    expect(doc.findSectionByNumber(2)!.p1_A).toBe(600);
    const { history, toolPanel } = lastSetup!;
    history.undo();
    toolPanel.notifyModelChanged();
    expect(doc.findSectionByNumber(2)!.p1_A).toBe(0);
    expect(target().value).toBe('2');
    expect((document.getElementById('section-calculator-apply') as HTMLButtonElement).disabled).toBe(false);
  });

  it('localizes service validation messages', () => {
    expect(localizeSectionError(new Error('thickness leaves no hollow core.'))).toContain('中空部');
    expect(localizeSectionError(new Error('width must be a finite positive number.'))).toBe('幅は正の有限値を入力してください。');
    expect(localizeSectionError(new Error('something else'))).toBe('something else');
  });
});
