export interface ToolPanelOpenOptions {
  /** Stable identifier so callers can tell which panel is open. */
  id?: string;
  /** Invoked while the panel stays open and the model changes. */
  onModelChanged?: () => void;
  /** Invoked when the panel content is replaced or closed. */
  onClose?: () => void;
}

/**
 * Floating tool panel inside the viewer. It can be collapsed, docked to the
 * viewer edge (so the 3D canvas shrinks instead of being covered) and resized.
 */
export class ToolPanel {
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly collapseButton: HTMLButtonElement | null;
  private readonly dockButton: HTMLButtonElement | null;
  private previousFocus: HTMLElement | null = null;
  private options: ToolPanelOpenOptions = {};
  private collapsed = false;
  private docked = false;

  constructor(private readonly onLayoutChanged?: () => void) {
    this.panel = document.getElementById('tool-panel')!;
    this.title = document.getElementById('tool-panel-title')!;
    this.body = document.getElementById('tool-panel-body')!;
    this.collapseButton = document.getElementById('tool-panel-collapse') as HTMLButtonElement | null;
    this.dockButton = document.getElementById('tool-panel-dock') as HTMLButtonElement | null;
    document.getElementById('tool-panel-close')?.addEventListener('click', () => this.close());
    this.collapseButton?.addEventListener('click', () => this.setCollapsed(!this.collapsed));
    this.dockButton?.addEventListener('click', () => this.setDocked(!this.docked));
    this.panel.dataset.panelId = '';
    this.syncButtons();
  }

  open(title: string, content: Node, options: ToolPanelOpenOptions = {}): void {
    if (!this.isOpen) {
      this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else if (this.options.id !== options.id) {
      this.options.onClose?.();
    }
    this.options = options;
    this.panel.dataset.panelId = options.id ?? '';
    this.title.textContent = title;
    this.body.replaceChildren(content);
    this.panel.classList.remove('hidden');
    this.setCollapsed(false, false);
    const firstControl = this.body.querySelector<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (firstControl ?? document.getElementById('tool-panel-close'))?.focus();
  }

  close(): void {
    const wasOpen = this.isOpen;
    this.panel.classList.add('hidden');
    this.body.replaceChildren();
    this.panel.dataset.panelId = '';
    const { onClose } = this.options;
    this.options = {};
    if (wasOpen) onClose?.();
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
    this.previousFocus = null;
    if (this.docked) this.onLayoutChanged?.();
  }

  /** Lets an open panel re-synchronize with the model after any change. */
  notifyModelChanged(): void {
    if (this.isOpen) this.options.onModelChanged?.();
  }

  get isOpen(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  get currentId(): string | null {
    return this.isOpen ? (this.options.id ?? null) : null;
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  get isDocked(): boolean {
    return this.docked;
  }

  setCollapsed(collapsed: boolean, notify = true): void {
    this.collapsed = collapsed;
    this.body.classList.toggle('hidden', collapsed);
    this.panel.classList.toggle('collapsed', collapsed);
    this.syncButtons();
    if (notify && this.docked) this.onLayoutChanged?.();
  }

  setDocked(docked: boolean): void {
    this.docked = docked;
    this.panel.classList.toggle('docked', docked);
    this.panel.parentElement?.classList.toggle('tool-panel-docked', docked);
    this.syncButtons();
    this.onLayoutChanged?.();
  }

  private syncButtons(): void {
    if (this.collapseButton) {
      this.collapseButton.setAttribute('aria-expanded', String(!this.collapsed));
      this.collapseButton.setAttribute('aria-pressed', String(this.collapsed));
      this.collapseButton.textContent = this.collapsed ? '▸' : '▾';
    }
    if (this.dockButton) {
      this.dockButton.setAttribute('aria-pressed', String(this.docked));
      this.dockButton.textContent = this.docked ? '⧉' : '⇤';
    }
  }
}
