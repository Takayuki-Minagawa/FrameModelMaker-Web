// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelInfoPanel, MODEL_INFO_PANEL_ID, quantityCsvRecords } from '../../src/app/ModelInfoPanel';
import { ToolPanel } from '../../src/app/ToolPanel';
import { downloadText } from '../../src/app/FileDownloads';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Material } from '../../src/models/Material';
import { Section } from '../../src/models/Section';
import { calculateModelStatistics } from '../../src/services/ModelStatistics';
import type { ModelViewer } from '../../src/viewer/ModelViewer';
import { FakeModelViewer } from './support/FakeModelViewer';
import { installDomPolyfills, mountPanelMarkup, press } from './support/dom';

vi.mock('../../src/app/FileDownloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/FileDownloads')>()),
  downloadText: vi.fn(),
}));

function model() {
  const doc = new FrameDocument();
  const section = new Section();
  section.number = 1;
  section.p1_A = 10;
  doc.sections.push(section);
  const a = doc.addNode(doc.createNode(0, 0, 0));
  const b = doc.addNode(doc.createNode(100, 0, 0));
  const member = doc.createMember();
  member.iNodeNumber = a.number;
  member.jNodeNumber = b.number;
  member.sectionNumber = 1;
  doc.addMember(member);
  return doc;
}

function rowValue(label: string): string {
  const rows = [...document.querySelectorAll<HTMLTableRowElement>('#model-info-statistics tr')];
  const row = rows.find((item) => item.cells[0].textContent === label);
  if (!row) throw new Error(`Row ${label} not found`);
  return row.cells[1].textContent ?? '';
}

describe('ModelInfoPanel (R02)', () => {
  beforeEach(() => {
    installDomPolyfills();
    mountPanelMarkup();
    vi.mocked(downloadText).mockClear();
  });

  it('recalculates counts and totals while the panel stays open', () => {
    const doc = model();
    const toolPanel = new ToolPanel();
    const viewer = new FakeModelViewer(document.getElementById('viewer-panel')!, doc) as unknown as ModelViewer;
    const show = createModelInfoPanel({ doc, viewer, toolPanel, updateViewerToggleStates: () => undefined, updateStatus: () => undefined });
    show();
    expect(toolPanel.currentId).toBe(MODEL_INFO_PANEL_ID);
    expect(rowValue('節点')).toBe('2');
    expect(rowValue('部材総延長 (cm)')).toBe('100');

    doc.addNode(doc.createNode(0, 50, 0));
    doc.nodes[1].x = 150;
    doc.notifyChange();
    toolPanel.notifyModelChanged();
    expect(rowValue('節点')).toBe('3');
    expect(rowValue('部材総延長 (cm)')).toBe('150');
    expect(document.getElementById('model-info-statistics')!.dataset.state).toBe('current');
  });

  it('exports the quantities CSV from the latest model with unit-suffixed columns', async () => {
    const doc = model();
    const toolPanel = new ToolPanel();
    const viewer = new FakeModelViewer(document.getElementById('viewer-panel')!, doc) as unknown as ModelViewer;
    const statuses: string[] = [];
    createModelInfoPanel({ doc, viewer, toolPanel, updateViewerToggleStates: () => undefined, updateStatus: (m) => statuses.push(m) })();
    doc.nodes[1].x = 200;
    doc.notifyChange();
    await press(document.getElementById('tool-panel-body')!, '数量CSVを書き出す（cm / cm³）');
    const csv = vi.mocked(downloadText).mock.calls[0][0] as string;
    expect(csv).toContain('sectionNumber,memberCount,totalLength_cm,volume_cm3');
    expect(csv).toContain('1,1,200,2000');
    expect(statuses.at(-1)).toContain('200');
    expect(quantityCsvRecords(calculateModelStatistics(doc))[0]).toEqual({
      sectionNumber: 1,
      memberCount: 1,
      totalLength_cm: 200,
      volume_cm3: 2000,
    });
  });

  it('lists material numbers in the colour legend (R18)', () => {
    const doc = model();
    const toolPanel = new ToolPanel();
    const fake = new FakeModelViewer(document.getElementById('viewer-panel')!, doc);
    const material = new Material();
    material.number = 3;
    material.name = 'SS400';
    doc.materials.push(material);
    createModelInfoPanel({ doc, viewer: fake as unknown as ModelViewer, toolPanel, updateViewerToggleStates: () => undefined, updateStatus: () => undefined })();
    const colorMode = document.querySelectorAll<HTMLSelectElement>('#tool-panel-body select')[1];
    colorMode.value = 'material';
    colorMode.dispatchEvent(new Event('change'));
    expect(document.getElementById('color-legend')!.textContent).toContain('Material 3: SS400');
  });
});
