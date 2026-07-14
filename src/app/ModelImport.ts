import {
  parseFrameJson,
  type FrameJsonDiagnostic,
  type FrameJsonParseResult,
} from '../io/FrameJson';
import { FrameDocument } from '../models/FrameDocument';

/**
 * User-supplied JSON is checked strictly first, then retried in compatibility
 * mode so older tools and hand-edited files remain importable with diagnostics.
 */
export function parseUserFrameJson(text: string, document: FrameDocument): FrameJsonParseResult {
  try {
    return parseFrameJson(text, document, { mode: 'strict' });
  } catch (strictError) {
    const result = parseFrameJson(text, document, { mode: 'lenient' });
    const fallbackDiagnostic: FrameJsonDiagnostic = {
      level: 'warning',
      code: 'lenient_import_fallback',
      path: '$',
      message: `Strict validation failed; compatibility import was used. ${
        strictError instanceof Error ? strictError.message : String(strictError)
      }`,
    };
    return {
      ...result,
      diagnostics: [fallbackDiagnostic, ...result.diagnostics],
    };
  }
}
