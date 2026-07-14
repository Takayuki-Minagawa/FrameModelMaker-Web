export class ToolPanel {
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private previousFocus: HTMLElement | null = null;

  constructor() {
    this.panel = document.getElementById('tool-panel')!;
    this.title = document.getElementById('tool-panel-title')!;
    this.body = document.getElementById('tool-panel-body')!;
    document.getElementById('tool-panel-close')?.addEventListener('click', () => this.close());
  }

  open(title: string, content: Node): void {
    if (!this.isOpen) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    this.title.textContent = title;
    this.body.replaceChildren(content);
    this.panel.classList.remove('hidden');
    const firstControl = this.body.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (firstControl ?? document.getElementById('tool-panel-close'))?.focus();
  }

  close(): void {
    this.panel.classList.add('hidden');
    this.body.replaceChildren();
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
    this.previousFocus = null;
  }

  get isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }
}
