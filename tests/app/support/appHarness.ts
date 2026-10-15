import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { FakeModelViewer } from './FakeModelViewer';
import { flush, installDomPolyfills, mountAppMarkup } from './dom';

export type AppModule = typeof import('../../../src/app/FrameApplication');

/**
 * Boots the real application (index.html + FrameApplication.initialize) in
 * jsdom with the WebGL viewer replaced by FakeModelViewer. Call `vi.mock` for
 * the viewer module in the test file before using this helper:
 *
 *   vi.mock('../../src/viewer/ModelViewer', () => import('./support/viewerMock'));
 */
export async function bootApplication(options: { lang?: 'ja' | 'en' } = {}) {
  installDomPolyfills();
  localStorage.clear();
  if (options.lang) localStorage.setItem('lang', options.lang);
  mountAppMarkup();
  vi.resetModules();
  const module: AppModule = await import('../../../src/app/FrameApplication');
  module.initialize();
  await flush();
  const app = module.getApplicationForTesting();
  return {
    module,
    app,
    viewer: app.viewer as unknown as FakeModelViewer,
    doc: app.doc,
  };
}

export function sampleModelText(): string {
  return readFileSync(resolve(process.cwd(), 'public/samples/FrameModel_Sample.json'), 'utf8');
}

/** Opens a menu entry the way a user would (details → button). */
export async function menu(id: string): Promise<void> {
  const button = document.getElementById(id);
  if (!button) throw new Error(`Menu ${id} not found.`);
  button.closest('details')?.setAttribute('open', '');
  button.click();
  await flush();
}

export function gridInput(rowIndex: number, columnKey: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    `#grid-container .data-grid-editor[data-row-index="${rowIndex}"][data-column-key="${columnKey}"]`,
  );
  if (!input) throw new Error(`Grid cell ${rowIndex}/${columnKey} not rendered.`);
  return input;
}

export function key(target: EventTarget, init: KeyboardEventInit): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
}
