import { getLang, t } from '../i18n';
import type { DialogService } from './DialogService';

let handleUiError: (error: unknown) => void = console.error;
export function setUiErrorHandler(handler: (error: unknown) => void): void {
  handleUiError = handler;
}

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required UI element #${id} was not found.`);
  return element as T;
}

export function localText(ja: string, en: string): string {
  return getLang() === 'ja' ? ja : en;
}

export function nextNumber(items: ReadonlyArray<{ number: number }>, start = 1): number {
  return items.reduce((maximum, item) => Math.max(maximum, item.number), start - 1) + 1;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, '');
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createButton(
  label: string,
  action: () => void | Promise<void>,
  className = 'panel-action',
): HTMLButtonElement {
  const button = createElement('button', className, label);
  button.type = 'button';
  button.addEventListener('click', () => {
    Promise.resolve().then(action).catch(handleUiError);
  });
  return button;
}

export function setPressed(id: string, pressed: boolean): void {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.toggle('active', pressed);
  element.setAttribute('aria-pressed', String(pressed));
}

export interface DialogField {
  name: string;
  label: string;
  value?: string;
  type?: 'text' | 'number' | 'select' | 'textarea';
  options?: Array<{ value: string; label: string }>;
}

export function labelled(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = createElement('label');
  label.append(createElement('span', undefined, labelText), control);
  return label;
}

export async function requestFields(
  dialogService: DialogService,
  title: string,
  fields: DialogField[],
): Promise<Record<string, string> | null> {
  const content = createElement('div', 'panel-form');
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  for (const field of fields) {
    let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.type === 'select') {
      control = createElement('select');
      for (const candidate of field.options ?? []) {
        const item = document.createElement('option');
        item.value = candidate.value;
        item.textContent = candidate.label;
        item.selected = candidate.value === field.value;
        control.appendChild(item);
      }
    } else if (field.type === 'textarea') {
      control = createElement('textarea');
      control.value = field.value ?? '';
    } else {
      control = createElement('input');
      control.type = field.type ?? 'text';
      control.value = field.value ?? '';
    }
    control.name = field.name;
    controls.set(field.name, control);
    content.appendChild(labelled(field.label, control));
  }
  const confirmed = await dialogService.confirm({
    title,
    body: content,
    confirmLabel: t('dialog.confirm'),
    cancelLabel: t('dialog.cancel'),
  });
  if (!confirmed) return null;
  return Object.fromEntries([...controls].map(([name, control]) => [name, control.value]));
}
