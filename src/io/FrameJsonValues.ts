import { JsonValue } from '../models/AnalysisMetadata';

import { JsonObject, ParseContext } from './FrameJsonTypes';

export function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

export function readObject(value: unknown, path: string, context: ParseContext): JsonObject {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  invalidValue(context, path, 'an object', value);
  return {};
}

export function readRequiredObject(value: unknown, path: string, context: ParseContext): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  invalidValue(context, path, 'an object', value);
  return {};
}

export function readArray(value: unknown, path: string, context: ParseContext): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  invalidValue(context, path, 'array', value);
  return [];
}

export function invalidValue(context: ParseContext, path: string, expected: string, value: unknown): void {
  const message = `${path} must be ${expected}; got ${JSON.stringify(value)}.`;
  if (context.mode === 'strict') throw new Error(`Invalid frame JSON: ${message}`);
  context.diagnostics.push({
    level: 'warning',
    code: 'coerced_invalid_value',
    path,
    message: `${message} The default value was used.`,
  });
}

export function toNumber(value: unknown, path: string, context: ParseContext, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (context.mode === 'lenient') {
    const number = Number(value);
    if (Number.isFinite(number)) {
      context.diagnostics.push({
        level: 'warning',
        code: 'coerced_number',
        path,
        message: `${path} was converted to a number.`,
      });
      return number;
    }
  }
  invalidValue(context, path, 'a finite number', value);
  return fallback;
}

export function toInt(value: unknown, path: string, context: ParseContext, fallback = 0): number {
  const number = toNumber(value, path, context, fallback);
  if (Number.isInteger(number)) return number;
  if (context.mode === 'strict') {
    invalidValue(context, path, 'an integer', value);
    return fallback;
  }
  const truncated = Math.trunc(number);
  context.diagnostics.push({
    level: 'warning',
    code: 'coerced_integer',
    path,
    message: `${path} was truncated from ${number} to ${truncated}.`,
  });
  return truncated;
}

export function toString_(value: unknown, path: string, context: ParseContext, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (context.mode === 'strict') {
    invalidValue(context, path, 'a string', value);
    return fallback;
  }
  context.diagnostics.push({
    level: 'warning',
    code: 'coerced_string',
    path,
    message: `${path} was converted to a string.`,
  });
  return String(value);
}

export function toBoolean(value: unknown, path: string, context: ParseContext, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  if (context.mode === 'lenient') {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value;
    if (normalized === 1 || normalized === '1' || normalized === 'true') {
      context.diagnostics.push({
        level: 'warning',
        code: 'coerced_boolean',
        path,
        message: `${path} was converted to true.`,
      });
      return true;
    }
    if (normalized === 0 || normalized === '0' || normalized === 'false') {
      context.diagnostics.push({
        level: 'warning',
        code: 'coerced_boolean',
        path,
        message: `${path} was converted to false.`,
      });
      return false;
    }
  }
  invalidValue(context, path, 'a boolean', value);
  return fallback;
}

export function deepJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function hasOwn(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function readNumberArray(value: unknown, path: string, context: ParseContext): number[] {
  return readArray(value, path, context).map((item, index) => toNumber(item, `${path}[${index}]`, context));
}

export function readIntegerArray(value: unknown, path: string, context: ParseContext): number[] {
  return readArray(value, path, context).map((item, index) => toInt(item, `${path}[${index}]`, context));
}

export function readStringArray(value: unknown, path: string, context: ParseContext): string[] {
  return readArray(value, path, context).map((item, index) => toString_(item, `${path}[${index}]`, context));
}

export function readNumberOrString(
  value: unknown,
  path: string,
  context: ParseContext,
): number | string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  invalidValue(context, path, 'a finite number or string', value);
  return undefined;
}

export function cloneJsonValue(value: unknown, path: string, context: ParseContext): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    invalidValue(context, path, 'a finite JSON number', value);
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => cloneJsonValue(item, `${path}[${index}]`, context));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as JsonObject)) {
      result[key] = cloneJsonValue(item, `${path}.${key}`, context);
    }
    return result;
  }
  invalidValue(context, path, 'a JSON value', value);
  return null;
}

export function cloneJsonObject(
  value: unknown,
  path: string,
  context: ParseContext,
): Record<string, JsonValue> {
  const object = readObject(value, path, context);
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(object)) {
    result[key] = cloneJsonValue(item, `${path}.${key}`, context);
  }
  return result;
}
