const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;

export function safeFilename(value: string, fallback: string): string {
  const sanitized = value.trim().replace(INVALID_FILENAME_CHARS, '_').replace(/[. ]+$/g, '');
  return sanitized || fallback;
}

export function downloadText(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function recordsToCsv(records: ReadonlyArray<Record<string, unknown>>, keys?: readonly string[]): string {
  const columns = keys ? [...keys] : [...new Set(records.flatMap(record => Object.keys(record)))];
  const lines = [columns.map(csvCell).join(',')];
  for (const record of records) {
    lines.push(columns.map(key => csvCell(record[key])).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function assertImportFileSize(file: File, maxBytes = MAX_IMPORT_FILE_BYTES): void {
  if (file.size > maxBytes) {
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum: ${maxMb} MB.`);
  }
}
