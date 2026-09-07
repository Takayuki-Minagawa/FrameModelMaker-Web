import type { ImportDiagnostic, PreparedImport } from '../io/ImportDocument';
import { downloadText, recordsToCsv } from './FileDownloads';
import { createButton, createElement, localText } from './UiHelpers';

export function diagnosticDownloads(diagnostics: readonly ImportDiagnostic[]): HTMLElement {
  const buttons = createElement('div', 'panel-actions');
  buttons.append(
    createButton('JSON', () =>
      downloadText(JSON.stringify(diagnostics, null, 2), 'diagnostics.json', 'application/json'),
    ),
    createButton('CSV', () =>
      downloadText(
        recordsToCsv(
          diagnostics.map((item) => ({
            level: item.level,
            code: item.code,
            message: item.message,
            kind: item.target?.kind ?? '',
            number: item.target?.number ?? '',
          })),
          ['level', 'code', 'message', 'kind', 'number'],
        ),
        'diagnostics.csv',
        'text/csv',
      ),
    ),
    createButton('Markdown', () =>
      downloadText(
        '# Import / export diagnostics\n\n' +
          diagnostics
            .map((item) => `- ${item.level} / ${item.code}: ${item.message.replace(/[\r\n]/g, ' ')}`)
            .join('\n'),
        'diagnostics.md',
        'text/markdown',
      ),
    ),
  );
  return buttons;
}

export function importPreview(fileName: string, result: PreparedImport): HTMLElement {
  const content = createElement('div', 'panel-form');
  content.append(createElement('p', undefined, `${fileName} — ${result.units}`));
  content.append(
    createElement(
      'p',
      undefined,
      localText(
        `節点 ${result.model.nodes.length} / 部材 ${result.model.members.length} / エラー ${result.errorCount}`,
        `Nodes ${result.model.nodes.length} / Members ${result.model.members.length} / Errors ${result.errorCount}`,
      ),
    ),
  );
  content.append(diagnosticDownloads(result.diagnostics));
  const list = createElement('div', 'diagnostic-list');
  for (const item of result.diagnostics)
    list.append(createElement('p', `diagnostic-item ${item.level}`, `[${item.code}] ${item.message}`));
  content.append(list);
  return content;
}
