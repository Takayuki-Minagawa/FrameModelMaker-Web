// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { DialogService } from '../../src/app/DialogService';
import { PresetPanel } from '../../src/app/PresetPanel';
import { ToolPanel } from '../../src/app/ToolPanel';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Section, SectionShape } from '../../src/models/Section';
import { PresetRepository, type ViewPreset } from '../../src/services/Presets';
import type { ModelViewer } from '../../src/viewer/ModelViewer';
import { FakeModelViewer } from './support/FakeModelViewer';
import { buttonByText, confirmDialog, flush, installDomPolyfills, mountPanelMarkup, setDialogValue, setValue } from './support/dom';

function viewPreset(name: string): ViewPreset {
  return {
    kind: 'view',
    id: crypto.randomUUID(),
    name,
    version: 1,
    camera: { projection: 'orthographic', position: [1, 1, 1], target: [0, 0, 0], up: [0, 0, 1], zoom: 2 },
    view: { kind: 'plan' },
    layers: { grid: true, axes: true, nodes: true, members: true, walls: false, boundaries: true, loads: false, results: false, labels: true },
    color: 'section',
    labels: { mode: 'all', maxLabels: 100, minSpacingPx: 10 },
  };
}

function setup() {
  installDomPolyfills();
  mountPanelMarkup();
  localStorage.clear();
  const doc = new FrameDocument();
  const section = new Section();
  section.number = 1;
  section.comment = 'B1';
  doc.sections.push(section);
  const viewer = new FakeModelViewer(document.getElementById('viewer-panel')!, doc);
  const toolPanel = new ToolPanel();
  const dialogService = new DialogService();
  const notifications: Array<[string, string]> = [];
  const repository = new PresetRepository();
  const panel = new PresetPanel(
    doc,
    viewer as unknown as ModelViewer,
    dialogService,
    toolPanel,
    (_label, action) => action(),
    (kind, message) => notifications.push([kind, message]),
    repository,
  );
  const body = () => document.getElementById('tool-panel-body')!;
  return { doc, viewer, panel, repository, notifications, body };
}

describe('PresetPanel (R20)', () => {
  beforeEach(() => localStorage.clear());

  it('names every action after its preset, searches, renames, duplicates and undoes deletion', async () => {
    const { panel, repository, notifications, body } = setup();
    repository.save(viewPreset('Iso view'));
    repository.save({
      kind: 'section',
      id: crypto.randomUUID(),
      name: 'H-300',
      version: 1,
      formulaVersion: 1,
      units: 'cm-kN',
      input: { shape: SectionShape.Rectangle, width: 10, height: 20 },
    });
    panel.show();
    expect(buttonByText(body(), '適用: Iso view')).toBeTruthy();
    expect(buttonByText(body(), '削除: H-300')).toBeTruthy();

    setValue(body().querySelector<HTMLInputElement>('#preset-search')!, 'iso');
    expect(body().querySelectorAll('#preset-list [data-preset-id]')).toHaveLength(1);
    setValue(body().querySelector<HTMLInputElement>('#preset-search')!, '');
    expect(body().querySelectorAll('#preset-list [data-preset-id]')).toHaveLength(2);

    const renaming = buttonByText(body(), '名前変更: Iso view').click();
    await flush();
    setDialogValue('name', 'Plan view');
    await confirmDialog();
    await flush();
    void renaming;
    expect(repository.list().map((preset) => preset.name)).toContain('Plan view');
    expect(notifications.at(-1)![1]).toContain('Plan view');

    buttonByText(body(), '複製: Plan view').click();
    await flush();
    expect(repository.list().map((preset) => preset.name)).toContain('Plan view Copy');

    buttonByText(body(), '削除: Plan view Copy').click();
    await flush();
    expect(repository.list().map((preset) => preset.name)).not.toContain('Plan view Copy');
    buttonByText(body(), '削除を元に戻す: Plan view Copy').click();
    await flush();
    expect(repository.list().map((preset) => preset.name)).toContain('Plan view Copy');
  });

  it('reports what a view preset applied and what a section preset changed', async () => {
    const { doc, viewer, panel, repository, notifications, body } = setup();
    repository.save(viewPreset('Iso view'));
    repository.save({
      kind: 'section',
      id: crypto.randomUUID(),
      name: 'Rect',
      version: 1,
      formulaVersion: 1,
      units: 'cm-kN',
      input: { shape: SectionShape.Rectangle, width: 10, height: 20 },
    });
    panel.show();
    buttonByText(body(), '適用: Iso view').click();
    await flush();
    expect(viewer.getProjectionMode()).toBe('orthographic');
    expect(viewer.getMemberColorMode()).toBe('section');
    expect(notifications.at(-1)![1]).toContain('ビュー「Iso view」を適用');

    buttonByText(body(), '適用: Rect').click();
    await flush();
    await confirmDialog();
    await flush();
    expect(doc.sections[0].p1_A).toBe(200);
    expect(notifications.at(-1)![1]).toContain('断面 1 へ適用');
    expect(notifications.at(-1)![1]).toContain('A=200 cm²');
  });
});
