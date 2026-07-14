export interface DialogOptions {
  title: string;
  body: string | Node;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export class DialogService {
  private readonly dialog: HTMLDialogElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;

  constructor(dialogId = 'app-dialog') {
    this.dialog = document.getElementById(dialogId) as HTMLDialogElement;
    this.title = document.getElementById('app-dialog-title')!;
    this.body = document.getElementById('app-dialog-body')!;
    this.confirmButton = document.getElementById('app-dialog-confirm') as HTMLButtonElement;
    this.cancelButton = this.dialog.querySelector<HTMLButtonElement>('#app-dialog-actions button[value="cancel"]')!;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-dialog-cancel]').forEach(button => {
      button.addEventListener('click', () => this.dialog.close('cancel'));
    });
    this.dialog.addEventListener('cancel', () => {
      this.dialog.returnValue = 'cancel';
    });
  }

  confirm(options: DialogOptions): Promise<boolean> {
    this.title.textContent = options.title;
    this.body.replaceChildren();
    if (typeof options.body === 'string') {
      const paragraph = document.createElement('p');
      paragraph.textContent = options.body;
      this.body.appendChild(paragraph);
    } else {
      this.body.appendChild(options.body);
    }
    this.confirmButton.textContent = options.confirmLabel ?? 'OK';
    this.cancelButton.textContent = options.cancelLabel ?? 'Cancel';
    this.confirmButton.classList.toggle('toolbar-btn-danger', options.destructive === true);

    return new Promise(resolve => {
      const onClose = () => {
        this.dialog.removeEventListener('close', onClose);
        resolve(this.dialog.returnValue === 'confirm');
      };
      this.dialog.addEventListener('close', onClose);
      this.dialog.returnValue = '';
      this.dialog.showModal();
    });
  }
}
