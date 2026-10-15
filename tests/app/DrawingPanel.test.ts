// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { createDrawingPanel } from '../../src/app/DrawingPanel';
import { FrameDocument } from '../../src/models/FrameDocument';
import type { DrawingEvent, ModelViewer } from '../../src/viewer/ModelViewer';
import { FakeModelViewer } from './support/FakeModelViewer';
import { installDomPolyfills, mountPanelMarkup, press, setValue } from './support/dom';

function setup() {
  installDomPolyfills();
  mountPanelMarkup();
  const doc = new FrameDocument();
  doc.addNode(doc.createNode(100, 0, 0));
  const viewer = new FakeModelViewer(document.getElementById('viewer-panel')!, doc);
  const events: DrawingEvent[] = [];
  viewer.setOnDrawingEvent((event) => events.push(event));
  const notifications: Array<[string, string]> = [];
  const panel = createDrawingPanel({ doc, viewer: viewer as unknown as ModelViewer, notify: (kind, message) => notifications.push([kind, message]) });
  viewer.setOnDrawingCursor((info) => panel.syncCursor(info));
  const body = () => document.getElementById('drawing-panel-body')!;
  const input = (name: string) => body().querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  return { doc, viewer, panel, events, notifications, body, input };
}

describe('DrawingPanel (R10)', () => {
  beforeEach(() => localStorage.clear());

  it('shows mode, cursor position and snapped node as text', () => {
    const { viewer, panel, body } = setup();
    viewer.setDrawingMode('node');
    panel.show();
    expect(panel.isOpen()).toBe(true);
    expect(document.getElementById('drawing-mode-text')!.dataset.mode).toBe('node');
    expect(document.getElementById('drawing-mode-text')!.textContent).toContain('節点');
    viewer.emitCursor({ position: [100, 0, 0], nodeNumber: 1 });
    const cursor = document.getElementById('drawing-cursor-text')!;
    expect(cursor.textContent).toContain('(100, 0, 0)');
    expect(cursor.textContent).toContain('節点 1');
    expect(cursor.dataset.nodeNumber).toBe('1');
    viewer.emitCursor({ position: [12.5, 50, 0] });
    expect(cursor.textContent).toContain('(12.5, 50, 0)');
    expect(cursor.textContent).toContain('グリッド');
    expect(body().textContent).toContain('作業平面 Z');
  });

  it('confirms absolute and relative coordinates and sets snap options and the work plane', async () => {
    const { viewer, panel, events, input, body, notifications } = setup();
    viewer.setViewMode({ kind: 'plan' });
    viewer.setDrawingMode('member');
    panel.show();
    setValue(input('absolute-x'), '12.5');
    setValue(input('absolute-y'), '0');
    setValue(input('absolute-z'), '0');
    await press(body(), '絶対座標で確定');
    expect(events.at(-1)).toMatchObject({ type: 'member-start', position: [12.5, 0, 0] });
    expect(document.getElementById('drawing-mode-text')!.textContent).toContain('始点: (12.5, 0, 0)');

    setValue(input('relative-x'), '87.5');
    setValue(input('relative-y'), '0');
    setValue(input('relative-z'), '0');
    await press(body(), '相対座標で確定（基準点 + Δ）');
    expect(events.at(-1)).toMatchObject({ type: 'member-create', start: [12.5, 0, 0], end: [100, 0, 0], endNodeNumber: 1 });

    setValue(input('snap-spacing'), '25');
    expect(viewer.getDrawingOptions().gridSpacing).toBe(25);
    input('snap-grid').checked = false;
    input('snap-grid').dispatchEvent(new Event('change'));
    expect(viewer.getDrawingOptions().snapToGrid).toBe(false);
    setValue(input('work-plane'), '300');
    expect(viewer.getViewMode()).toEqual({ kind: 'plan', elevation: 300 });
    expect(notifications.some(([, message]) => message.includes('300'))).toBe(true);

    setValue(input('snap-spacing'), '-1');
    expect(viewer.getDrawingOptions().gridSpacing).toBe(25);
    expect(notifications.at(-1)![0]).toBe('error');
  });

  it('refuses to confirm outside a drawing mode', async () => {
    const { viewer, panel, events, input, body, notifications } = setup();
    panel.show();
    setValue(input('absolute-x'), '1');
    await press(body(), '絶対座標で確定');
    expect(events).toHaveLength(0);
    expect(notifications.at(-1)![0]).toBe('error');
    viewer.setDrawingMode('node');
    await press(body(), '作図モードを終了');
    expect(viewer.getDrawingMode()).toBe('none');
    expect(panel.isOpen()).toBe(false);
  });
});
