// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { ToolPanel } from '../../src/app/ToolPanel';
import { click, installDomPolyfills, mountPanelMarkup } from './support/dom';

describe('ToolPanel (R02 / R17)', () => {
  beforeEach(() => {
    installDomPolyfills();
    mountPanelMarkup();
  });

  it('forwards model changes to the open panel and stops after close or replacement', () => {
    const panel = new ToolPanel();
    let first = 0;
    let second = 0;
    let closed = 0;
    panel.open('A', document.createTextNode('a'), { id: 'a', onModelChanged: () => first++, onClose: () => closed++ });
    panel.notifyModelChanged();
    expect(first).toBe(1);
    expect(panel.currentId).toBe('a');
    panel.open('B', document.createTextNode('b'), { id: 'b', onModelChanged: () => second++ });
    expect(closed).toBe(1);
    panel.notifyModelChanged();
    expect(first).toBe(1);
    expect(second).toBe(1);
    panel.close();
    panel.notifyModelChanged();
    expect(second).toBe(1);
    expect(panel.currentId).toBeNull();
  });

  it('collapses and docks with accessible state and layout callbacks', async () => {
    let layoutChanges = 0;
    const panel = new ToolPanel(() => layoutChanges++);
    panel.open('A', document.createTextNode('a'), { id: 'a' });
    await click('tool-panel-collapse');
    expect(panel.isCollapsed).toBe(true);
    expect(document.getElementById('tool-panel-body')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('tool-panel-collapse')!.getAttribute('aria-expanded')).toBe('false');
    await click('tool-panel-collapse');
    expect(panel.isCollapsed).toBe(false);

    await click('tool-panel-dock');
    expect(panel.isDocked).toBe(true);
    expect(document.getElementById('tool-panel')!.classList.contains('docked')).toBe(true);
    expect(document.getElementById('viewer-panel')!.classList.contains('tool-panel-docked')).toBe(true);
    expect(document.getElementById('tool-panel-dock')!.getAttribute('aria-pressed')).toBe('true');
    expect(layoutChanges).toBe(1);
    panel.close();
    expect(layoutChanges).toBe(2);
  });
});
