import { LoadCaseType } from '../models/LoadCase';

import { CURRENT_FRAME_JSON_FORMAT_VERSION, JsonObject } from './FrameJsonTypes';
import { asObject, deepJsonClone } from './FrameJsonValues';

export function inferRawLoadCaseCount(raw: JsonObject): number {
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const members = Array.isArray(raw.members) ? raw.members : [];
  let count = 1;
  for (const value of nodes) {
    const loads = asObject(value).loads;
    if (Array.isArray(loads)) count = Math.max(count, loads.length);
  }
  for (const value of members) {
    const member = asObject(value);
    if (Array.isArray(member.memberLoads)) count = Math.max(count, member.memberLoads.length);
    if (Array.isArray(member.cmqLoads)) count = Math.max(count, member.cmqLoads.length);
  }
  const requested = Number(raw.loadCaseCount);
  if (Number.isFinite(requested)) count = Math.max(count, Math.trunc(requested));
  if (Array.isArray(raw.loadCases)) count = Math.max(count, raw.loadCases.length);
  return count;
}

export function migrateV1ToV2(raw: JsonObject): JsonObject {
  const count = inferRawLoadCaseCount(raw);
  const existingLoadCases = Array.isArray(raw.loadCases) ? raw.loadCases : [];
  const loadCases = Array.from({ length: count }, (_, index) => {
    const existing = asObject(existingLoadCases[index]);
    return {
      id: typeof existing.id === 'string' && existing.id ? existing.id : `LC${index + 1}`,
      name: typeof existing.name === 'string' && existing.name ? existing.name : `Load Case ${index + 1}`,
      type: typeof existing.type === 'string' && existing.type ? existing.type : LoadCaseType.Other,
      memo: typeof existing.memo === 'string' ? existing.memo : '',
    };
  });
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((value) => {
        const section = asObject(value);
        return {
          ...section,
          torsionConstant: section.torsionConstant ?? section.p2_Ix ?? 0,
        };
      })
    : raw.sections;
  const boundaries = Array.isArray(raw.boundaries)
    ? raw.boundaries.map((value) => {
        const boundary = asObject(value);
        const normalized = (field: string): number => {
          const value = boundary[field];
          return value == null || Number(value) === 0 ? 0 : 1;
        };
        return {
          ...boundary,
          deltaX: normalized('deltaX'),
          deltaY: normalized('deltaY'),
          deltaZ: normalized('deltaZ'),
          thetaX: normalized('thetaX'),
          thetaY: normalized('thetaY'),
          thetaZ: normalized('thetaZ'),
        };
      })
    : raw.boundaries;
  // v1サンプルは予約バネ2を配列にも含めていた。v2では予約定義を仮想要素として扱う。
  const springs = Array.isArray(raw.springs)
    ? raw.springs.filter((value) => {
        const number = Number(asObject(value).number);
        return number !== 1 && number !== 2;
      })
    : raw.springs;
  return {
    ...raw,
    formatVersion: CURRENT_FRAME_JSON_FORMAT_VERSION,
    loadCaseCount: count,
    loadCases,
    loadCombinations: Array.isArray(raw.loadCombinations) ? raw.loadCombinations : [],
    analysisMetadata: raw.analysisMetadata ?? null,
    sections,
    boundaries,
    springs,
  };
}

/**
 * 旧JSONを現在形式へ決定的に移行する。現在形式へ再適用しても内容を変更しない。
 */
export function migrateFrameJson(value: unknown): { document: JsonObject; migratedFrom?: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid JSON: root must be an object');
  }
  const raw = deepJsonClone(value as JsonObject);
  const versionValue = raw.formatVersion;
  const version = versionValue == null ? 1 : versionValue;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid frame JSON formatVersion: ${JSON.stringify(versionValue)}.`);
  }
  if (version > CURRENT_FRAME_JSON_FORMAT_VERSION) {
    throw new Error(
      `Unsupported future frame JSON formatVersion ${version}; current version is ${CURRENT_FRAME_JSON_FORMAT_VERSION}.`,
    );
  }
  if (version === CURRENT_FRAME_JSON_FORMAT_VERSION) return { document: raw };
  if (version === 1) return { document: migrateV1ToV2(raw), migratedFrom: 1 };
  throw new Error(`No migration is available for frame JSON formatVersion ${version}.`);
}
