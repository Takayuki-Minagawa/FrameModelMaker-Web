// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { DialogService } from '../../src/app/DialogService';
import { EditorController } from '../../src/app/EditorController';
import { patternFromAnswer, showFrameTemplateDialog, showPatternDialog } from '../../src/app/PatternPanel';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Section } from '../../src/models/Section';
import { DocumentHistory } from '../../src/services/DocumentHistory';
import {
  cancelDialog,
  confirmDialog,
  dialog,
  dialogInput,
  flush,
  installDomPolyfills,
  mountPanelMarkup,
  setDialogValue,
} from './support/dom';

function setup() {
  installDomPolyfills();
  mountPanelMarkup();
  const doc = new FrameDocument();
  const section = new Section();
  section.number = 1;
  section.comment = 'B1';
  doc.sections.push(section);
  const history = new DocumentHistory(doc, { trustChangeNotifications: true });
  const editor = new EditorController(doc, history);
  const notifications: Array<[string, string]> = [];
  const mutate = <T>(label: string, action: () => T): T => editor.execute(label, action);
  return {
    doc,
    dialogService: new DialogService(),
    mutate,
    notifications,
    notify: (kind: string, message: string) => notifications.push([kind, message]),
  };
}

describe('Pattern dialog (R05 / R11)', () => {
  beforeEach(() => localStorage.clear());

  it('accepts ΔX = 12.5 and shows only the fields of the chosen method with a preview', async () => {
    const { doc, dialogService, mutate, notifications, notify } = setup();
    const node = doc.addNode(doc.createNode(0, 0, 0));
    const pending = showPatternDialog(doc, { nodes: [node.number], members: [], walls: [] }, dialogService, mutate, notify as never);
    await flush();
    expect(dialogInput('count').step).toBe('1');
    expect(dialogInput('x').step).toBe('any');
    expect(dialogInput('angle').closest('label')!.classList.contains('hidden')).toBe(true);
    expect(dialogInput('offset').closest('label')!.classList.contains('hidden')).toBe(true);
    expect(dialogInput('axis').closest('label')!.classList.contains('hidden')).toBe(true);

    setDialogValue('x', '12.5');
    expect(dialogInput('x').validity.stepMismatch).toBe(false);
    const preview = () => dialog().querySelector<HTMLElement>('#pattern-preview')!;
    expect(preview().dataset.valid).toBe('true');
    expect(preview().textContent).toContain('追加: 節点 1');
    expect(preview().textContent).toContain('(12.5, 0, 0)');

    setDialogValue('kind', 'radial');
    expect(dialogInput('x').closest('label')!.classList.contains('hidden')).toBe(true);
    expect(dialogInput('ox').closest('label')!.classList.contains('hidden')).toBe(false);
    expect(dialogInput('angle').closest('label')!.classList.contains('hidden')).toBe(false);
    setDialogValue('angle', '0.5');
    expect(dialogInput('angle').validity.stepMismatch).toBe(false);

    setDialogValue('kind', 'mirror');
    expect(dialogInput('count').closest('label')!.classList.contains('hidden')).toBe(true);
    expect(dialogInput('offset').closest('label')!.classList.contains('hidden')).toBe(false);

    setDialogValue('kind', 'linear');
    setDialogValue('count', '2');
    await confirmDialog();
    await pending;
    expect(doc.nodes).toHaveLength(3);
    expect(doc.nodes[1].x).toBe(12.5);
    expect(doc.nodes[2].x).toBe(25);
    expect(notifications.at(-1)).toEqual(['success', expect.stringContaining('節点 2')]);
  });

  it('reports cancellation and invalid previews without touching the model', async () => {
    const { doc, dialogService, mutate, notifications, notify } = setup();
    const node = doc.addNode(doc.createNode(0, 0, 0));
    const pending = showPatternDialog(doc, { nodes: [node.number], members: [], walls: [] }, dialogService, mutate, notify as never);
    await flush();
    setDialogValue('count', '0');
    expect(dialog().querySelector<HTMLElement>('#pattern-preview')!.dataset.valid).toBe('false');
    await cancelDialog();
    await pending;
    expect(doc.nodes).toHaveLength(1);
    expect(notifications.at(-1)![0]).toBe('cancel');
  });

  it('maps radial answers to origin coordinates', () => {
    expect(patternFromAnswer({ kind: 'radial', count: '2', x: '1', y: '2', z: '3', axis: 'z', angle: '45' })).toEqual({
      kind: 'radial',
      count: 2,
      axis: 'z',
      angleDegrees: 45,
      origin: [1, 2, 3],
    });
  });
});

describe('Frame template dialog (R05 / R07)', () => {
  it('uses integer steps for counts, decimals for dimensions, and reports the generated counts', async () => {
    const { doc, dialogService, mutate, notifications, notify } = setup();
    const pending = showFrameTemplateDialog(doc, dialogService, mutate, notify as never);
    await flush();
    expect(dialogInput('spans').step).toBe('1');
    expect(dialogInput('stories').step).toBe('1');
    expect(dialogInput('span').step).toBe('any');
    expect(dialogInput('height').step).toBe('any');
    setDialogValue('spans', '1');
    setDialogValue('stories', '1');
    setDialogValue('span', '600.5');
    setDialogValue('height', '300.25');
    expect(dialogInput('span').validity.stepMismatch).toBe(false);
    await confirmDialog();
    await pending;
    expect(doc.nodes).toHaveLength(4);
    expect(doc.nodes.map((node) => node.x)).toContain(600.5);
    expect(doc.nodes.map((node) => node.z)).toContain(300.25);
    expect(notifications.at(-1)![0]).toBe('success');
    expect(notifications.at(-1)![1]).toContain('節点 4');
  });

  it('throws a localized error without sections and cancels cleanly', async () => {
    const { doc, dialogService, mutate, notifications, notify } = setup();
    doc.sections.length = 0;
    await expect(showFrameTemplateDialog(doc, dialogService, mutate, notify as never)).rejects.toThrow('先に断面');
    const section = new Section();
    section.number = 1;
    doc.sections.push(section);
    const pending = showFrameTemplateDialog(doc, dialogService, mutate, notify as never);
    await flush();
    await cancelDialog();
    await pending;
    expect(notifications.at(-1)![0]).toBe('cancel');
  });
});
