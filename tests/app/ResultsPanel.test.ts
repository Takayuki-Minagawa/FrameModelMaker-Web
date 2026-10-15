// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from '../../src/app/FileDownloads';
import { createResultsPanel, RESULTS_PANEL_ID } from '../../src/app/ResultsPanel';
import { ToolPanel } from '../../src/app/ToolPanel';
import { parseFrameJson } from '../../src/io/FrameJson';
import { FrameDocument } from '../../src/models/FrameDocument';
import type { ModelViewer, ViewerSelection } from '../../src/viewer/ModelViewer';
import { FakeModelViewer } from './support/FakeModelViewer';
import { click, flush, installDomPolyfills, mountPanelMarkup, setValue } from './support/dom';

vi.mock('../../src/app/FileDownloads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/app/FileDownloads')>()),
  downloadText: vi.fn(),
}));

function readSample(name: string): string {
  return readFileSync(resolve(process.cwd(), 'public/samples/contracts', name), 'utf8');
}

async function loadResultsFile(text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[name="results-file"]')!;
  const file = new File([text], 'results.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => text });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
  await flush(10);
}

function setup() {
  installDomPolyfills();
  mountPanelMarkup();
  const doc = new FrameDocument();
  parseFrameJson(readSample('frame-v2.json'), doc, { mode: 'strict' });
  const toolPanel = new ToolPanel();
  const viewer = new FakeModelViewer(document.getElementById('viewer-panel')!, doc);
  let selection: ViewerSelection = { kind: 'none' };
  const statuses: string[] = [];
  const errors: unknown[] = [];
  const panel = createResultsPanel({
    doc,
    viewer: viewer as unknown as ModelViewer,
    toolPanel,
    updateViewerToggleStates: () => undefined,
    updateStatus: (message) => statuses.push(message),
    reportError: (error) => errors.push(error),
    getSelection: () => selection,
  });
  const state = () => document.getElementById('results-state') as HTMLElement;
  return { doc, toolPanel, viewer, panel, statuses, errors, state, setSelection: (next: ViewerSelection) => (selection = next) };
}

describe('ResultsPanel (R14 / R15)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(downloadText).mockClear();
  });

  it('reports the unloaded state, disables playback and exposes the loaded state as text', async () => {
    const { panel, toolPanel, state, statuses, errors } = setup();
    panel.show();
    expect(toolPanel.currentId).toBe(RESULTS_PANEL_ID);
    expect(state().dataset.loaded).toBe('false');
    expect(state().dataset.frameCount).toBe('0');
    expect(state().textContent).toContain('結果未読込・0フレーム');
    expect((document.getElementById('results-play') as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('results-next') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="results-frame-number"]')!.disabled).toBe(true);

    const raw = JSON.parse(readSample('results-v1.json'));
    raw.frames.push({ ...raw.frames[0], time: 2 });
    await loadResultsFile(JSON.stringify(raw));
    expect(errors).toEqual([]);
    expect(state().dataset.loaded).toBe('true');
    expect(state().dataset.frameCount).toBe('2');
    expect(state().dataset.frameIndex).toBe('1');
    expect(state().textContent).toContain('results.json');
    expect(state().textContent).toContain('停止中');
    expect((document.getElementById('results-play') as HTMLButtonElement).disabled).toBe(false);
    expect(statuses.at(-1)).toContain('2フレーム');
  });

  it('supports direct frame / time input, stepping, playback state and discards results while open', async () => {
    const { panel, viewer, state, toolPanel } = setup();
    panel.show();
    const raw = JSON.parse(readSample('results-v1.json'));
    raw.frames.push({ ...raw.frames[0], time: 2 }, { ...raw.frames[0], time: 4 });
    await loadResultsFile(JSON.stringify(raw));
    expect(state().dataset.frameCount).toBe('3');

    await click('results-next');
    expect(state().dataset.frameIndex).toBe('2');
    await click('results-last');
    expect(state().dataset.frameIndex).toBe('3');
    await click('results-prev');
    expect(state().dataset.frameIndex).toBe('2');
    await click('results-first');
    expect(state().dataset.frameIndex).toBe('1');
    setValue(document.querySelector<HTMLInputElement>('input[name="results-frame-number"]')!, '3');
    expect(state().dataset.frameIndex).toBe('3');
    setValue(document.querySelector<HTMLInputElement>('input[name="results-time"]')!, '2.2');
    expect(state().dataset.frameIndex).toBe('2');
    expect(state().textContent).toContain('2 / 3');

    setValue(document.querySelector<HTMLInputElement>('input[name="results-fps"]')!, '30');
    setValue(document.querySelector<HTMLInputElement>('input[name="results-loop"]')!, '');
    (document.querySelector<HTMLInputElement>('input[name="results-loop"]')!).checked = false;
    document.querySelector<HTMLInputElement>('input[name="results-loop"]')!.dispatchEvent(new Event('change'));
    await click('results-play');
    expect(state().dataset.playing).toBe('true');
    expect(state().textContent).toContain('再生中');
    expect(viewer.lastAnimation).toMatchObject({ fps: 30, loop: false });
    viewer.tickAnimation(2);
    expect(state().dataset.frameIndex).toBe('3');
    await click('results-pause');
    expect(state().dataset.playing).toBe('false');

    // Editing the model discards results; the open panel must show that immediately.
    expect(panel.invalidate()).toBe(true);
    toolPanel.notifyModelChanged();
    expect(state().dataset.loaded).toBe('false');
    expect(state().dataset.frameCount).toBe('0');
    expect(state().textContent).toContain('結果未読込・0フレーム');
    expect((document.getElementById('results-play') as HTMLButtonElement).disabled).toBe(true);
    expect(panel.hasResults()).toBe(false);
  });

  it('shows values for the selected node / member, extremes, and exports the current frame as CSV', async () => {
    const { doc, panel, setSelection } = setup();
    panel.show();
    const raw = JSON.parse(readSample('results-v1.json'));
    await loadResultsFile(JSON.stringify(raw));
    const node = raw.frames[0].nodes[0];
    const member = raw.frames[0].members[0];
    setSelection({ kind: 'node', nodeNumber: node.nodeNumber });
    panel.syncSelection();
    const selection = () => document.getElementById('results-selection')!.textContent!;
    expect(selection()).toContain(`${node.nodeNumber}`);
    expect(selection()).toContain('dx / dy / dz (cm)');
    expect(selection()).toContain('kN·cm');
    setSelection({ kind: 'member', memberNumber: member.memberNumber });
    panel.syncSelection();
    expect(selection()).toContain('I (0)');
    expect(selection()).toContain('J (1)');
    expect(selection()).toContain('N (kN)');
    setSelection({ kind: 'none' });
    panel.syncSelection();
    expect(selection()).toContain('節点または部材を選択');

    const extremes = document.getElementById('results-extremes')!.textContent!;
    expect(extremes).toContain('最大');
    expect(extremes).toContain('dz (cm)');
    expect(doc.nodes.length).toBeGreaterThan(0);

    await click('results-export-csv');
    const [csv, filename] = vi.mocked(downloadText).mock.calls[0];
    expect(String(csv)).toContain('kind,number,position,dx_cm');
    expect(String(filename)).toContain('results-frame1.csv');
  });
});
