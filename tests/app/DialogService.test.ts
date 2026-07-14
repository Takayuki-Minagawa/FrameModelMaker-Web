// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogService } from '../../src/app/DialogService';

describe('DialogService', () => {
  let dialog: HTMLDialogElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <dialog id="app-dialog">
        <form method="dialog">
          <h2 id="app-dialog-title"></h2>
          <button type="button" value="cancel" data-dialog-cancel>Close</button>
          <div id="app-dialog-body"></div>
          <footer id="app-dialog-actions">
            <button type="button" value="cancel" data-dialog-cancel>Cancel</button>
            <button id="app-dialog-confirm" type="submit" value="confirm">Confirm</button>
          </footer>
        </form>
      </dialog>`;
    dialog = document.getElementById('app-dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
    dialog.close = vi.fn((returnValue = '') => {
      dialog.returnValue = returnValue;
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    });
  });

  it('clears a prior confirmation and treats native cancellation as cancellation', async () => {
    const service = new DialogService();
    const first = service.confirm({ title: 'First', body: 'Confirm once' });
    dialog.close('confirm');
    await expect(first).resolves.toBe(true);

    const second = service.confirm({ title: 'Second', body: 'Cancel now' });
    expect(dialog.returnValue).toBe('');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));

    await expect(second).resolves.toBe(false);
    expect(dialog.returnValue).toBe('cancel');
  });
});
