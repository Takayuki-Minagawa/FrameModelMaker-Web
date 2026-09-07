import { FrameDocument } from '../models/FrameDocument';
import { validateFrameDocument } from '../validation/FrameValidator';
import { toFrameJson } from './FrameJson';
import { parseUserFrameJson } from './UserFrameJson';

export interface ImportDiagnostic {
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  target?: { kind: string; number?: number };
}

export async function prepareDocumentImport(text: string, format: 'json' | 'yaml') {
  const document = new FrameDocument();
  const diagnostics: ImportDiagnostic[] = [];
  if (format === 'yaml') {
    const { parseFrameAnalysisYaml } = await import('./FrameAnalysisYaml');
    const result = parseFrameAnalysisYaml(text, document);
    diagnostics.push(
      ...result.diagnostics.map((item) => ({
        level: item.level,
        code: item.code,
        message: item.message,
        target: item.tag == null ? undefined : { kind: item.entityType ?? 'document', number: item.tag },
      })),
    );
  } else {
    const result = parseUserFrameJson(text, document);
    diagnostics.push(
      ...result.diagnostics.map((item) => ({
        level: item.level === 'warning' ? ('warn' as const) : ('info' as const),
        code: item.code,
        message: `${item.path}: ${item.message}`,
      })),
    );
  }
  const validation = validateFrameDocument(document);
  diagnostics.push(
    ...validation.diagnostics.map((item) => ({
      level: item.severity === 'warning' ? ('warn' as const) : item.severity,
      code: item.code,
      message: item.message,
      target: { kind: item.entity.kind, number: item.entity.number },
    })),
  );
  return {
    model: toFrameJson(document),
    diagnostics,
    errorCount: validation.errorCount,
    units: format === 'yaml' ? 'mm / N → cm / kN' : 'cm / kN',
  };
}

export type PreparedImport = Awaited<ReturnType<typeof prepareDocumentImport>>;
