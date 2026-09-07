import { JsonValue } from '../models/AnalysisMetadata';
import { Section } from '../models/Section';

export type RawObject = Record<string, unknown>;

export type FrameYamlDiagnosticLevel = 'info' | 'warn' | 'error';

export interface FrameYamlImportDiagnostic {
  level: FrameYamlDiagnosticLevel;
  code: string;
  message: string;
  tag?: number;
  sourcePath?: string;
  entityType?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface FrameYamlImportResult {
  diagnostics: FrameYamlImportDiagnostic[];
  importedNodeCount: number;
  importedMemberCount: number;
  skippedElementCount: number;
}

export interface NumberedSection {
  key: string;
  section: Section;
}

export const ZERO_LENGTH_EPSILON_CM = 1e-9;
export const SHORT_LINK_WARNING_CM = 0.1;
export const GENERATED_TRUSS_SECTION_KEY_PREFIX = '__generated_truss__';
export const GENERATED_LINK_SECTION_KEY = '__generated_two_node_link__';

export function asObject(value: unknown): RawObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as RawObject;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface FrameYamlExportResult {
  yaml: string;
  diagnostics: FrameYamlImportDiagnostic[];
}

export function asEntries(value: unknown): Array<{ key?: string; value: unknown }> {
  if (Array.isArray(value)) return value.map((item) => ({ value: item }));
  if (value && typeof value === 'object') {
    return Object.entries(value as RawObject).map(([key, item]) => ({ key, value: item }));
  }
  return [];
}

export function toJsonValue(value: unknown): JsonValue | undefined {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value as JsonValue;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item) ?? null);
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as RawObject)) {
      const converted = toJsonValue(item);
      if (converted !== undefined) result[key] = converted;
    }
    return result;
  }
  return String(value);
}

export function toNumberArray(value: unknown): number[] {
  return asArray(value)
    .map((item) => toNumber(item, NaN))
    .filter(Number.isFinite);
}

/** Positional arrays represent DOFs/vector components, so invalid slots must not shift later values. */
export function toPositionalNumberArray(value: unknown, fallback = 0): number[] {
  return asArray(value).map((item) => toNumber(item, fallback));
}

export function toStringArray(value: unknown): string[] {
  return asArray(value).map(toString_).filter(Boolean);
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function toPositiveInt(value: unknown, fallback = 0): number {
  const n = Math.trunc(toNumber(value, fallback));
  return n > 0 ? n : fallback;
}

export function toString_(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

export function makeDiagnostic(
  level: FrameYamlDiagnosticLevel,
  code: string,
  message: string,
  tag?: number,
): FrameYamlImportDiagnostic {
  return tag == null ? { level, code, message } : { level, code, message, tag };
}

export function requireUnitFactor(units: RawObject, key: string, expected: string, factor: number): number {
  const unit = toString_(units[key]);
  if (!unit) {
    throw new Error(`Invalid analysis YAML: units.${key} is required`);
  }
  if (unit !== expected) {
    throw new Error(`Invalid analysis YAML: units.${key} must be "${expected}" (got "${unit}")`);
  }
  return factor;
}
