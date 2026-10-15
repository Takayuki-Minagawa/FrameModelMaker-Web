// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { DialogService } from '../../src/app/DialogService';
import { requestFields } from '../../src/app/UiHelpers';
import {
  cancelDialog,
  chooseDialog,
  confirmDialog,
  dialog,
  dialogInput,
  flush,
  installDomPolyfills,
  mountPanelMarkup,
  setDialogValue,
} from './support/dom';

describe('requestFields (R05 / R11)', () => {
  let service: DialogService;

  beforeEach(() => {
    installDomPolyfills();
    mountPanelMarkup();
    service = new DialogService();
  });

  it('accepts decimals for lengths, coordinates and angles and integers only for counts', async () => {
    const pending = requestFields(service, 'Pattern', [
      { name: 'count', label: 'Copies', type: 'number', value: '1', integer: true, min: 1 },
      { name: 'x', label: 'ΔX', type: 'number', value: '100' },
      { name: 'angle', label: 'Angle', type: 'number', value: '90' },
    ]);
    await flush();
    expect(dialogInput('count').step).toBe('1');
    expect(dialogInput('x').step).toBe('any');
    expect(dialogInput('angle').step).toBe('any');
    setDialogValue('x', '12.5');
    setDialogValue('angle', '0.5');
    expect(dialogInput('x').validity.stepMismatch).toBe(false);
    expect(dialogInput('angle').validity.stepMismatch).toBe(false);
    setDialogValue('count', '2.5');
    expect(dialogInput('count').validity.stepMismatch).toBe(true);
    setDialogValue('count', '3');
    await confirmDialog();
    await expect(pending).resolves.toEqual({ count: '3', x: '12.5', angle: '0.5' });
  });

  it('hides irrelevant fields, disables them for validation and refreshes the preview', async () => {
    const seen: string[] = [];
    const pending = requestFields(
      service,
      'Pattern',
      [
        {
          name: 'kind',
          label: 'Kind',
          type: 'select',
          options: [
            { value: 'linear', label: 'Linear' },
            { value: 'mirror', label: 'Mirror' },
          ],
        },
        { name: 'count', label: 'Copies', type: 'number', value: '1', integer: true, visibleWhen: (v) => v.kind !== 'mirror' },
        { name: 'offset', label: 'Offset', type: 'number', value: '0', visibleWhen: (v) => v.kind === 'mirror' },
      ],
      { preview: (values) => (seen.push(values.kind), `kind=${values.kind}`) },
    );
    await flush();
    const count = dialogInput('count');
    const offset = dialogInput('offset');
    expect(count.closest('label')!.classList.contains('hidden')).toBe(false);
    expect(offset.closest('label')!.classList.contains('hidden')).toBe(true);
    expect(offset.disabled).toBe(true);
    expect(dialog().querySelector('.dialog-preview')!.textContent).toBe('kind=linear');
    setDialogValue('kind', 'mirror');
    expect(count.closest('label')!.classList.contains('hidden')).toBe(true);
    expect(count.disabled).toBe(true);
    expect(offset.disabled).toBe(false);
    expect(dialog().querySelector('.dialog-preview')!.textContent).toBe('kind=mirror');
    expect(seen).toContain('mirror');
    await cancelDialog();
    await expect(pending).resolves.toBeNull();
  });

  it('renders field descriptions for meaning and units (R12)', async () => {
    const pending = requestFields(service, 'Frame', [
      { name: 'span', label: 'Span (cm)', type: 'number', value: '600', description: 'Decimals allowed' },
    ]);
    await flush();
    expect(dialog().querySelector('.field-description')!.textContent).toBe('Decimals allowed');
    expect(dialogInput('span').getAttribute('aria-description')).toBe('Decimals allowed');
    await cancelDialog();
    await pending;
  });
});

describe('DialogService.choose (R01)', () => {
  beforeEach(() => {
    installDomPolyfills();
    mountPanelMarkup();
  });

  it('resolves with the chosen value and null on cancel, using localized default labels', async () => {
    const service = new DialogService();
    const first = service.choose({
      title: 'Unsaved',
      body: 'Save?',
      choices: [
        { value: 'save', label: 'Save' },
        { value: 'discard', label: 'Discard', destructive: true },
      ],
    });
    await flush();
    expect(dialog().querySelectorAll('[data-dialog-choice]')).toHaveLength(2);
    expect(document.getElementById('app-dialog-confirm')!.classList.contains('hidden')).toBe(true);
    await chooseDialog('discard');
    await expect(first).resolves.toBe('discard');

    const second = service.choose({ title: 'Again', body: 'Save?', choices: [{ value: 'save', label: 'Save' }] });
    await flush();
    await cancelDialog();
    await expect(second).resolves.toBeNull();

    const third = service.confirm({ title: 'Plain', body: 'OK?' });
    await flush();
    expect(document.getElementById('app-dialog-confirm')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('app-dialog-confirm')!.textContent).toBe('OK');
    expect(dialog().querySelector('#app-dialog-actions button[value="cancel"]')!.textContent).toBe('キャンセル');
    await confirmDialog();
    await expect(third).resolves.toBe(true);
  });
});
