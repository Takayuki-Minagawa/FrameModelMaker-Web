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

/** Renders a label/value table used by information and result panels. */
export function createKeyValueTable(
  rows: ReadonlyArray<[string, string | number]>,
  className = 'panel-table',
): HTMLTableElement {
  const table = createElement('table', className);
  for (const [label, rawValue] of rows) {
    const row = table.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = typeof rawValue === 'number' ? formatNumber(rawValue) : rawValue;
  }
  return table;
}

export interface DialogField {
  name: string;
  label: string;
  value?: string;
  type?: 'text' | 'number' | 'select' | 'textarea';
  options?: Array<{ value: string; label: string }>;
  /**
   * Numeric inputs accept decimals (`step="any"`) by default so lengths,
   * coordinates and angles such as 12.5 cm or 0.5° are never rejected by the
   * browser's step validation. Set `integer` for counts.
   */
  integer?: boolean;
  min?: number;
  max?: number;
  /** Short explanation (meaning, unit, positive direction, example). */
  description?: string;
  /** Hides the field (and skips its validation) when it is not relevant. */
  visibleWhen?: (values: Record<string, string>) => boolean;
}

export interface RequestFieldsOptions {
  /** Text or node rendered below the fields and refreshed on every change. */
  preview?: (values: Record<string, string>) => string | Node | null;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function labelled(labelText: string, control: HTMLElement, description?: string): HTMLLabelElement {
  const label = createElement('label');
  const caption = createElement('span', undefined, labelText);
  if (description) {
    caption.title = description;
    const hint = createElement('small', 'field-description', description);
    caption.append(hint);
    control.setAttribute('aria-description', description);
  }
  label.append(caption, control);
  return label;
}

export function applyNumericConstraints(
  control: HTMLInputElement,
  field: Pick<DialogField, 'integer' | 'min' | 'max'>,
): void {
  control.type = 'number';
  control.step = field.integer ? '1' : 'any';
  control.inputMode = field.integer ? 'numeric' : 'decimal';
  if (field.min !== undefined) control.min = String(field.min);
  if (field.max !== undefined) control.max = String(field.max);
}

export async function requestFields(
  dialogService: DialogService,
  title: string,
  fields: DialogField[],
  options: RequestFieldsOptions = {},
): Promise<Record<string, string> | null> {
  const content = createElement('div', 'panel-form');
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  const labels = new Map<string, HTMLLabelElement>();
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
      if (field.type === 'number') applyNumericConstraints(control, field);
      else control.type = field.type ?? 'text';
      control.value = field.value ?? '';
    }
    control.name = field.name;
    controls.set(field.name, control);
    const label = labelled(field.label, control, field.description);
    labels.set(field.name, label);
    content.appendChild(label);
  }
  const preview = createElement('p', 'dialog-preview');
  preview.setAttribute('aria-live', 'polite');
  if (options.preview) content.appendChild(preview);

  const currentValues = (): Record<string, string> =>
    Object.fromEntries([...controls].map(([name, control]) => [name, control.value]));
  const refresh = (): void => {
    const values = currentValues();
    for (const field of fields) {
      if (!field.visibleWhen) continue;
      const visible = field.visibleWhen(values);
      labels.get(field.name)?.classList.toggle('hidden', !visible);
      // Hidden fields must not block native form validation.
      controls.get(field.name)!.disabled = !visible;
    }
    if (options.preview) {
      const rendered = options.preview(values);
      preview.replaceChildren();
      if (typeof rendered === 'string') preview.textContent = rendered;
      else if (rendered) preview.appendChild(rendered);
    }
  };
  content.addEventListener('input', refresh);
  content.addEventListener('change', refresh);
  refresh();

  const confirmed = await dialogService.confirm({
    title,
    body: content,
    confirmLabel: options.confirmLabel ?? t('dialog.confirm'),
    cancelLabel: options.cancelLabel ?? t('dialog.cancel'),
  });
  if (!confirmed) return null;
  return currentValues();
}
