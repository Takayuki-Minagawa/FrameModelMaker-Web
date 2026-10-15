import { t } from '../i18n';

export interface DialogOptions {
  title: string;
  body: string | Node;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface DialogChoice {
  value: string;
  label: string;
  destructive?: boolean;
  secondary?: boolean;
}

export interface ChoiceDialogOptions {
  title: string;
  body: string | Node;
  choices: DialogChoice[];
  cancelLabel?: string;
}

export class DialogService {
  private pending: Promise<unknown> | null = null;
  private readonly dialog: HTMLDialogElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly actions: HTMLElement;

  constructor(dialogId = 'app-dialog') {
    this.dialog = document.getElementById(dialogId) as HTMLDialogElement;
    this.title = document.getElementById('app-dialog-title')!;
    this.body = document.getElementById('app-dialog-body')!;
    this.confirmButton = document.getElementById('app-dialog-confirm') as HTMLButtonElement;
    this.actions = document.getElementById('app-dialog-actions')!;
    this.cancelButton = this.dialog.querySelector<HTMLButtonElement>(
      '#app-dialog-actions button[value="cancel"]',
    )!;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-dialog-cancel]').forEach((button) => {
      button.addEventListener('click', () => this.dialog.close('cancel'));
    });
    this.dialog.addEventListener('cancel', () => {
      this.dialog.returnValue = 'cancel';
    });
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  confirm(options: DialogOptions): Promise<boolean> {
    return this.enqueue(() => this.show(options)).then((value) => value === 'confirm');
  }

  /**
   * Presents several outcomes (for example save / discard / cancel) and resolves
   * with the chosen value, or `null` when the dialog is cancelled or dismissed.
   */
  choose(options: ChoiceDialogOptions): Promise<string | null> {
    return this.enqueue(() => this.show(options)).then((value) =>
      value === 'cancel' || value === '' ? null : value,
    );
  }

  private enqueue(show: () => Promise<string>): Promise<string> {
    const result = this.pending ? this.pending.then(show, show) : show();
    const settled = result.finally(() => {
      if (this.pending === settled) this.pending = null;
    });
    this.pending = settled;
    return settled;
  }

  private show(options: DialogOptions | ChoiceDialogOptions): Promise<string> {
    this.title.textContent = options.title;
    this.body.replaceChildren();
    if (typeof options.body === 'string') {
      const paragraph = document.createElement('p');
      paragraph.textContent = options.body;
      this.body.appendChild(paragraph);
    } else {
      this.body.appendChild(options.body);
    }
    this.actions.querySelectorAll('[data-dialog-choice]').forEach((button) => button.remove());
    this.cancelButton.textContent = options.cancelLabel ?? t('dialog.cancel');
    if ('choices' in options) {
      this.confirmButton.classList.add('hidden');
      for (const choice of options.choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.dialogChoice = choice.value;
        button.textContent = choice.label;
        button.classList.toggle('secondary', choice.secondary === true);
        button.classList.toggle('toolbar-btn-danger', choice.destructive === true);
        button.addEventListener('click', () => this.dialog.close(choice.value));
        this.actions.appendChild(button);
      }
    } else {
      this.confirmButton.classList.remove('hidden');
      this.confirmButton.textContent = options.confirmLabel ?? t('dialog.ok');
      this.confirmButton.classList.toggle('toolbar-btn-danger', options.destructive === true);
    }

    return new Promise((resolve) => {
      const onClose = () => {
        this.dialog.removeEventListener('close', onClose);
        resolve(this.dialog.returnValue);
      };
      this.dialog.addEventListener('close', onClose);
      this.dialog.returnValue = '';
      this.dialog.showModal();
    });
  }
}
