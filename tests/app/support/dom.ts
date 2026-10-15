import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

/** Browser APIs jsdom lacks that the application touches at start-up. */
export function installDomPolyfills(): void {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
  const dialogPrototype = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  dialogPrototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialogPrototype.close = function close(this: HTMLDialogElement, returnValue = '') {
    this.returnValue = returnValue;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  Object.defineProperty(dialogPrototype, 'open', {
    configurable: true,
    get(this: HTMLDialogElement) {
      return this.hasAttribute('open');
    },
  });
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => undefined;
  }
  if (!('scrollIntoView' in Element.prototype)) {
    (Element.prototype as Element & { scrollIntoView: () => void }).scrollIntoView = () => undefined;
  }
  if (!('scrollBy' in Element.prototype)) {
    (Element.prototype as Element & { scrollBy: () => void }).scrollBy = () => undefined;
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0);
    window.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
  }
  if (!Blob.prototype.text) {
    Blob.prototype.text = function text(this: Blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined), readText: vi.fn(async () => '') },
    });
  }
}

/** Mounts the production index.html body (without the module script). */
export function mountAppMarkup(): void {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const body = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

/** Minimal markup for panels that are tested in isolation. */
export function mountPanelMarkup(): void {
  document.body.innerHTML = `
    <section id="viewer-panel">
      <div id="drawing-hint" class="viewer-hint hidden"></div>
      <aside id="drawing-panel" class="hidden">
        <div class="panel-header"><span id="drawing-panel-title"></span><button id="drawing-panel-close" type="button">×</button></div>
        <div id="drawing-panel-body"></div>
      </aside>
      <aside id="selection-info-panel" class="hidden">
        <div id="selection-info-header"><span id="selection-info-title"></span>
          <button id="selection-info-clear" type="button"></button>
          <button id="selection-info-close" type="button">×</button></div>
        <div id="selection-info-body"></div>
      </aside>
      <aside id="tool-panel" class="hidden">
        <div class="panel-header"><span id="tool-panel-title"></span>
          <span class="panel-header-actions">
            <button id="tool-panel-collapse" type="button"></button>
            <button id="tool-panel-dock" type="button"></button>
            <button id="tool-panel-close" type="button">×</button>
          </span></div>
        <div id="tool-panel-body"></div>
      </aside>
    </section>
    <dialog id="app-dialog">
      <form method="dialog">
        <h2 id="app-dialog-title"></h2>
        <button type="button" value="cancel" data-dialog-cancel>×</button>
        <div id="app-dialog-body"></div>
        <footer id="app-dialog-actions">
          <button type="button" value="cancel" data-dialog-cancel class="secondary">Cancel</button>
          <button id="app-dialog-confirm" type="submit" value="confirm">OK</button>
        </footer>
      </form>
    </dialog>
    <footer><span id="status-text"></span></footer>`;
}

export function dialog(): HTMLDialogElement {
  return document.getElementById('app-dialog') as HTMLDialogElement;
}

export function dialogIsOpen(): boolean {
  return dialog().hasAttribute('open');
}

/** Confirms the open application dialog (same as pressing its primary button). */
export async function confirmDialog(): Promise<void> {
  const element = dialog();
  if (!element.hasAttribute('open')) throw new Error('Dialog is not open.');
  element.close('confirm');
  await flush();
}

export async function cancelDialog(): Promise<void> {
  dialog().close('cancel');
  await flush();
}

export async function chooseDialog(value: string): Promise<void> {
  const button = dialog().querySelector<HTMLButtonElement>(`[data-dialog-choice="${value}"]`);
  if (!button) throw new Error(`Choice ${value} is not offered.`);
  button.click();
  await flush();
}

export function dialogInput(name: string): HTMLInputElement {
  const control = dialog().querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!control) throw new Error(`Dialog field ${name} not found.`);
  return control;
}

export function setDialogValue(name: string, value: string): void {
  const control = dialogInput(name);
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

export function setValue(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Clicks and lets the (promise-based) button handler run. */
export async function click(idOrElement: string | HTMLElement): Promise<void> {
  const element = typeof idOrElement === 'string' ? document.getElementById(idOrElement) : idOrElement;
  if (!element) throw new Error(`Element ${String(idOrElement)} not found.`);
  (element as HTMLElement).click();
  await flush();
}

export async function press(container: ParentNode, text: string): Promise<void> {
  buttonByText(container, text).click();
  await flush();
}

export function buttonByText(container: ParentNode, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text || item.getAttribute('aria-label') === text,
  );
  if (!button) throw new Error(`Button “${text}” not found.`);
  return button;
}

export function statusText(): string {
  return document.getElementById('status-text')?.textContent ?? '';
}

export function statusKind(): string {
  return (document.getElementById('status-text') as HTMLElement | null)?.dataset.kind ?? '';
}

/** Lets queued promises and microtasks settle. */
export async function flush(rounds = 4): Promise<void> {
  for (let index = 0; index < rounds; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}
