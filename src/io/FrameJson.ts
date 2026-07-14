import { FrameDocument } from '../models/FrameDocument';
import { BoundaryCondition } from '../models/BoundaryCondition';
import { Material } from '../models/Material';
import { Section, SectionShape, SectionType } from '../models/Section';
import { Spring } from '../models/Spring';
import { Wall } from '../models/Wall';
import { Node } from '../models/Node';
import { NodeLoad } from '../models/NodeLoad';
import { Member } from '../models/Member';
import { CMQLoad } from '../models/CMQLoad';
import { MemberLoad } from '../models/MemberLoad';
import { LoadCase, LoadCaseType } from '../models/LoadCase';
import { LoadCombination } from '../models/LoadCombination';
import {
  AnalysisMetadata,
  JsonValue,
  LocalAxisMetadata,
} from '../models/AnalysisMetadata';

type JsonObject = Record<string, unknown>;

export const CURRENT_FRAME_JSON_FORMAT_VERSION = 2 as const;
export type FrameJsonReadMode = 'strict' | 'lenient';

export interface FrameJsonReadOptions {
  /** strictは不正な型/数値を拒否し、lenientは既定値へ補正して診断を返す。 */
  mode?: FrameJsonReadMode;
}

export interface FrameJsonDiagnostic {
  level: 'warning' | 'info';
  code: string;
  path: string;
  message: string;
}

export interface FrameJsonParseResult {
  formatVersion: typeof CURRENT_FRAME_JSON_FORMAT_VERSION;
  migratedFrom?: number;
  diagnostics: FrameJsonDiagnostic[];
}

export interface FrameJsonDocument {
  formatVersion: typeof CURRENT_FRAME_JSON_FORMAT_VERSION;
  title: string;
  loadCaseCount: number;
  loadCaseIndex: number;
  calcCaseMemo: string[];
  loadCases: Array<{ id: string; name: string; type: string; memo: string }>;
  loadCombinations: Array<{
    id: string;
    name: string;
    memo: string;
    terms: Array<{ loadCaseId: string; factor: number }>;
  }>;
  analysisMetadata: AnalysisMetadata | null;
  nodes: Array<{
    number: number;
    x: number;
    y: number;
    z: number;
    temperature: number;
    intensityGroup: number;
    longWeight: number;
    forceWeight: number;
    addForceWeight: number;
    area: number;
    isShown: boolean;
    loads: Array<{ p1: number; p2: number; p3: number; m1: number; m2: number; m3: number }>;
  }>;
  members: Array<{
    number: number;
    iNodeNumber: number;
    jNodeNumber: number;
    ixSpring: number;
    iySpring: number;
    izSpring: number;
    jxSpring: number;
    jySpring: number;
    jzSpring: number;
    sectionNumber: number;
    p1: number;
    p2: number;
    p3: number;
    isShown: boolean;
    memberLoads: Array<{
      lengthMethod: number;
      type: number;
      direction: number;
      scale: number;
      loadCode: string;
      unitLoad: number;
      p1: number;
      p2: number;
      p3: number;
    }>;
    cmqLoads: Array<{
      moy: number;
      moz: number;
      iMy: number;
      iMz: number;
      iQx: number;
      iQy: number;
      iQz: number;
      jMy: number;
      jMz: number;
      jQx: number;
      jQy: number;
      jQz: number;
    }>;
  }>;
  sections: Array<{
    number: number;
    materialNumber: number;
    type: SectionType;
    shape: SectionShape;
    p1_A: number;
    /** 旧UI互換フィールド。新規処理ではtorsionConstantを使用する。 */
    p2_Ix: number;
    torsionConstant: number;
    p3_Iy: number;
    p4_Iz: number;
    ky: number;
    kz: number;
    comment: string;
  }>;
  materials: Array<{
    number: number;
    young: number;
    shear: number;
    expansion: number;
    poisson: number;
    unitLoad: number;
    name: string;
  }>;
  boundaries: Array<{
    nodeNumber: number;
    deltaX: number;
    deltaY: number;
    deltaZ: number;
    thetaX: number;
    thetaY: number;
    thetaZ: number;
  }>;
  springs: Array<{ number: number; method: number; kTheta: number }>;
  walls: Array<{
    number: number;
    leftBottomNode: number;
    rightBottomNode: number;
    leftTopNode: number;
    rightTopNode: number;
    materialNumber: number;
    method: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    isShown: boolean;
  }>;
}

interface ParseContext {
  mode: FrameJsonReadMode;
  diagnostics: FrameJsonDiagnostic[];
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonObject;
}

function readObject(value: unknown, path: string, context: ParseContext): JsonObject {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  invalidValue(context, path, 'an object', value);
  return {};
}

function readRequiredObject(value: unknown, path: string, context: ParseContext): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  invalidValue(context, path, 'an object', value);
  return {};
}

function readArray(value: unknown, path: string, context: ParseContext): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  invalidValue(context, path, 'array', value);
  return [];
}

function invalidValue(context: ParseContext, path: string, expected: string, value: unknown): void {
  const message = `${path} must be ${expected}; got ${JSON.stringify(value)}.`;
  if (context.mode === 'strict') throw new Error(`Invalid frame JSON: ${message}`);
  context.diagnostics.push({
    level: 'warning',
    code: 'coerced_invalid_value',
    path,
    message: `${message} The default value was used.`,
  });
}

function toNumber(value: unknown, path: string, context: ParseContext, fallback = 0): number {
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

function toInt(value: unknown, path: string, context: ParseContext, fallback = 0): number {
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

function toString_(value: unknown, path: string, context: ParseContext, fallback = ''): string {
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

function toBoolean(value: unknown, path: string, context: ParseContext, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  invalidValue(context, path, 'a boolean', value);
  return fallback;
}

function deepJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasOwn(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readNumberArray(value: unknown, path: string, context: ParseContext): number[] {
  return readArray(value, path, context)
    .map((item, index) => toNumber(item, `${path}[${index}]`, context));
}

function readIntegerArray(value: unknown, path: string, context: ParseContext): number[] {
  return readArray(value, path, context)
    .map((item, index) => toInt(item, `${path}[${index}]`, context));
}

function readStringArray(value: unknown, path: string, context: ParseContext): string[] {
  return readArray(value, path, context)
    .map((item, index) => toString_(item, `${path}[${index}]`, context));
}

function readNumberOrString(
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

function cloneJsonValue(value: unknown, path: string, context: ParseContext): JsonValue {
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

function cloneJsonObject(
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

function inferRawLoadCaseCount(raw: JsonObject): number {
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const members = Array.isArray(raw.members) ? raw.members : [];
  const lengths: number[] = [1];
  for (const value of nodes) {
    const loads = asObject(value).loads;
    if (Array.isArray(loads)) lengths.push(loads.length);
  }
  for (const value of members) {
    const member = asObject(value);
    if (Array.isArray(member.memberLoads)) lengths.push(member.memberLoads.length);
    if (Array.isArray(member.cmqLoads)) lengths.push(member.cmqLoads.length);
  }
  const requested = Number(raw.loadCaseCount);
  if (Number.isFinite(requested)) lengths.push(Math.trunc(requested));
  if (Array.isArray(raw.loadCases)) lengths.push(raw.loadCases.length);
  return Math.max(...lengths, 1);
}

function migrateV1ToV2(raw: JsonObject): JsonObject {
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
    ? raw.sections.map(value => {
      const section = asObject(value);
      return {
        ...section,
        torsionConstant: section.torsionConstant ?? section.p2_Ix ?? 0,
      };
    })
    : raw.sections;
  const boundaries = Array.isArray(raw.boundaries)
    ? raw.boundaries.map(value => {
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
    ? raw.springs.filter(value => {
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

function parseNodeLoad(value: unknown, path: string, context: ParseContext): NodeLoad {
  const object = readRequiredObject(value, path, context);
  const load = new NodeLoad();
  load.p1 = toNumber(object.p1, `${path}.p1`, context);
  load.p2 = toNumber(object.p2, `${path}.p2`, context);
  load.p3 = toNumber(object.p3, `${path}.p3`, context);
  load.m1 = toNumber(object.m1, `${path}.m1`, context);
  load.m2 = toNumber(object.m2, `${path}.m2`, context);
  load.m3 = toNumber(object.m3, `${path}.m3`, context);
  return load;
}

function parseMemberLoad(value: unknown, path: string, context: ParseContext): MemberLoad {
  const object = readRequiredObject(value, path, context);
  const load = new MemberLoad();
  load.lengthMethod = toInt(object.lengthMethod, `${path}.lengthMethod`, context);
  load.type = toInt(object.type, `${path}.type`, context);
  load.direction = toInt(object.direction, `${path}.direction`, context);
  load.scale = toNumber(object.scale, `${path}.scale`, context);
  load.loadCode = toString_(object.loadCode, `${path}.loadCode`, context);
  load.unitLoad = toNumber(object.unitLoad, `${path}.unitLoad`, context);
  load.p1 = toNumber(object.p1, `${path}.p1`, context);
  load.p2 = toNumber(object.p2, `${path}.p2`, context);
  load.p3 = toNumber(object.p3, `${path}.p3`, context);
  return load;
}

function parseCMQLoad(value: unknown, path: string, context: ParseContext): CMQLoad {
  const object = readRequiredObject(value, path, context);
  const load = new CMQLoad();
  const fields: Array<keyof CMQLoad> = [
    'moy', 'moz', 'iMy', 'iMz', 'iQx', 'iQy', 'iQz', 'jMy', 'jMz', 'jQx', 'jQy', 'jQz',
  ];
  for (const field of fields) {
    if (field !== 'isZero') load[field] = toNumber(object[field], `${path}.${field}`, context) as never;
  }
  return load;
}

function parseNode(value: unknown, index: number, context: ParseContext): Node {
  const path = `$.nodes[${index}]`;
  const object = readRequiredObject(value, path, context);
  const node = new Node();
  node.number = toInt(object.number, `${path}.number`, context);
  node.x = toNumber(object.x, `${path}.x`, context);
  node.y = toNumber(object.y, `${path}.y`, context);
  node.z = toNumber(object.z, `${path}.z`, context);
  node.temperature = toNumber(object.temperature, `${path}.temperature`, context);
  node.intensityGroup = toInt(object.intensityGroup, `${path}.intensityGroup`, context);
  node.longWeight = toNumber(object.longWeight, `${path}.longWeight`, context);
  node.forceWeight = toNumber(object.forceWeight, `${path}.forceWeight`, context);
  node.addForceWeight = toNumber(object.addForceWeight, `${path}.addForceWeight`, context);
  node.area = toNumber(object.area, `${path}.area`, context);
  node.loads = readArray(object.loads, `${path}.loads`, context)
    .map((load, loadIndex) => parseNodeLoad(load, `${path}.loads[${loadIndex}]`, context));
  node.selected = false;
  node.isShown = toBoolean(object.isShown, `${path}.isShown`, context, true);
  return node;
}

function parseBoundary(value: unknown, index: number, context: ParseContext): BoundaryCondition {
  const path = `$.boundaries[${index}]`;
  const object = readRequiredObject(value, path, context);
  const boundary = new BoundaryCondition();
  boundary.nodeNumber = toInt(object.nodeNumber, `${path}.nodeNumber`, context);
  boundary.deltaX = toInt(object.deltaX, `${path}.deltaX`, context);
  boundary.deltaY = toInt(object.deltaY, `${path}.deltaY`, context);
  boundary.deltaZ = toInt(object.deltaZ, `${path}.deltaZ`, context);
  boundary.thetaX = toInt(object.thetaX, `${path}.thetaX`, context);
  boundary.thetaY = toInt(object.thetaY, `${path}.thetaY`, context);
  boundary.thetaZ = toInt(object.thetaZ, `${path}.thetaZ`, context);
  return boundary;
}

function parseMaterial(value: unknown, index: number, context: ParseContext): Material {
  const path = `$.materials[${index}]`;
  const object = readRequiredObject(value, path, context);
  const material = new Material();
  material.number = toInt(object.number, `${path}.number`, context);
  material.young = toNumber(object.young, `${path}.young`, context);
  material.shear = toNumber(object.shear, `${path}.shear`, context);
  material.expansion = toNumber(object.expansion, `${path}.expansion`, context);
  material.poisson = toNumber(object.poisson, `${path}.poisson`, context);
  material.unitLoad = toNumber(object.unitLoad, `${path}.unitLoad`, context);
  material.name = toString_(object.name, `${path}.name`, context);
  return material;
}

function parseSection(value: unknown, index: number, context: ParseContext): Section {
  const path = `$.sections[${index}]`;
  const object = readRequiredObject(value, path, context);
  const section = new Section();
  section.number = toInt(object.number, `${path}.number`, context);
  section.materialNumber = toInt(object.materialNumber, `${path}.materialNumber`, context);
  section.type = toInt(object.type, `${path}.type`, context) as SectionType;
  section.shape = toInt(object.shape, `${path}.shape`, context) as SectionShape;
  section.p1_A = toNumber(object.p1_A, `${path}.p1_A`, context);
  section.p2_Ix = toNumber(object.p2_Ix, `${path}.p2_Ix`, context);
  section.torsionConstant = toNumber(
    object.torsionConstant ?? object.p2_Ix,
    `${path}.torsionConstant`,
    context,
  );
  section.p3_Iy = toNumber(object.p3_Iy, `${path}.p3_Iy`, context);
  section.p4_Iz = toNumber(object.p4_Iz, `${path}.p4_Iz`, context);
  section.ky = toNumber(object.ky, `${path}.ky`, context);
  section.kz = toNumber(object.kz, `${path}.kz`, context);
  section.comment = toString_(object.comment, `${path}.comment`, context);
  return section;
}

function parseSpring(value: unknown, index: number, context: ParseContext): Spring {
  const path = `$.springs[${index}]`;
  const object = readRequiredObject(value, path, context);
  const spring = new Spring();
  spring.number = toInt(object.number, `${path}.number`, context);
  spring.method = toInt(object.method, `${path}.method`, context);
  spring.kTheta = toNumber(object.kTheta, `${path}.kTheta`, context);
  return spring;
}

function parseMember(value: unknown, index: number, context: ParseContext): Member {
  const path = `$.members[${index}]`;
  const object = readRequiredObject(value, path, context);
  const member = new Member();
  member.number = toInt(object.number, `${path}.number`, context);
  member.iNodeNumber = toInt(object.iNodeNumber, `${path}.iNodeNumber`, context);
  member.jNodeNumber = toInt(object.jNodeNumber, `${path}.jNodeNumber`, context);
  member.ixSpring = toInt(object.ixSpring, `${path}.ixSpring`, context);
  member.iySpring = toInt(object.iySpring, `${path}.iySpring`, context);
  member.izSpring = toInt(object.izSpring, `${path}.izSpring`, context);
  member.jxSpring = toInt(object.jxSpring, `${path}.jxSpring`, context);
  member.jySpring = toInt(object.jySpring, `${path}.jySpring`, context);
  member.jzSpring = toInt(object.jzSpring, `${path}.jzSpring`, context);
  member.sectionNumber = toInt(object.sectionNumber, `${path}.sectionNumber`, context);
  member.p1 = toNumber(object.p1, `${path}.p1`, context);
  member.p2 = toNumber(object.p2, `${path}.p2`, context);
  member.p3 = toNumber(object.p3, `${path}.p3`, context);
  member.memberLoads = readArray(object.memberLoads, `${path}.memberLoads`, context)
    .map((load, loadIndex) => parseMemberLoad(load, `${path}.memberLoads[${loadIndex}]`, context));
  member.cmqLoads = readArray(object.cmqLoads, `${path}.cmqLoads`, context)
    .map((load, loadIndex) => parseCMQLoad(load, `${path}.cmqLoads[${loadIndex}]`, context));
  member.selected = false;
  member.isShown = toBoolean(object.isShown, `${path}.isShown`, context, true);
  return member;
}

function parseWall(value: unknown, index: number, context: ParseContext): Wall {
  const path = `$.walls[${index}]`;
  const object = readRequiredObject(value, path, context);
  const wall = new Wall();
  wall.number = toInt(object.number, `${path}.number`, context);
  wall.leftBottomNode = toInt(object.leftBottomNode, `${path}.leftBottomNode`, context);
  wall.rightBottomNode = toInt(object.rightBottomNode, `${path}.rightBottomNode`, context);
  wall.leftTopNode = toInt(object.leftTopNode, `${path}.leftTopNode`, context);
  wall.rightTopNode = toInt(object.rightTopNode, `${path}.rightTopNode`, context);
  wall.materialNumber = toInt(object.materialNumber, `${path}.materialNumber`, context);
  wall.method = toInt(object.method, `${path}.method`, context);
  wall.p1 = toNumber(object.p1, `${path}.p1`, context);
  wall.p2 = toNumber(object.p2, `${path}.p2`, context);
  wall.p3 = toNumber(object.p3, `${path}.p3`, context);
  wall.p4 = toNumber(object.p4, `${path}.p4`, context);
  wall.isShown = toBoolean(object.isShown, `${path}.isShown`, context, true);
  return wall;
}

function maxLoadCaseCount(document: FrameDocument): number {
  return Math.max(
    1,
    ...document.nodes.map(node => node.loads.length),
    ...document.members.flatMap(member => [member.memberLoads.length, member.cmqLoads.length]),
  );
}

function parseLoadCases(raw: JsonObject, count: number, context: ParseContext): LoadCase[] {
  const values = readArray(raw.loadCases, '$.loadCases', context);
  const result: LoadCase[] = [];
  const used = new Set<string>();
  for (let index = 0; index < count; index++) {
    const object = index < values.length
      ? readRequiredObject(values[index], `$.loadCases[${index}]`, context)
      : {};
    let id = toString_(object.id, `$.loadCases[${index}].id`, context, `LC${index + 1}`).trim();
    if (!id || used.has(id)) {
      if (context.mode === 'strict') {
        throw new Error(`Invalid frame JSON: load case id at index ${index} is empty or duplicated.`);
      }
      let serial = index + 1;
      while (used.has(`LC${serial}`)) serial++;
      id = `LC${serial}`;
      context.diagnostics.push({
        level: 'warning',
        code: 'repaired_load_case_id',
        path: `$.loadCases[${index}].id`,
        message: `The load case id was replaced with "${id}".`,
      });
    }
    used.add(id);
    result.push(new LoadCase(
      id,
      toString_(object.name, `$.loadCases[${index}].name`, context, `Load Case ${index + 1}`),
      toString_(object.type, `$.loadCases[${index}].type`, context, LoadCaseType.Other),
      toString_(object.memo, `$.loadCases[${index}].memo`, context),
    ));
  }
  return result;
}

function parseLoadCombinations(raw: JsonObject, context: ParseContext): LoadCombination[] {
  return readArray(raw.loadCombinations, '$.loadCombinations', context).map((value, index) => {
    const path = `$.loadCombinations[${index}]`;
    const object = readRequiredObject(value, path, context);
    const terms = readArray(object.terms, `${path}.terms`, context).map((termValue, termIndex) => {
      const term = readRequiredObject(termValue, `${path}.terms[${termIndex}]`, context);
      return {
        loadCaseId: toString_(term.loadCaseId, `${path}.terms[${termIndex}].loadCaseId`, context),
        factor: toNumber(term.factor, `${path}.terms[${termIndex}].factor`, context),
      };
    });
    return new LoadCombination(
      toString_(object.id, `${path}.id`, context, `COMB${index + 1}`),
      toString_(object.name, `${path}.name`, context, `Combination ${index + 1}`),
      terms,
      toString_(object.memo, `${path}.memo`, context),
    );
  });
}

function parseLocalAxisMetadata(
  value: unknown,
  path: string,
  context: ParseContext,
): LocalAxisMetadata {
  const object = readRequiredObject(value, path, context);
  const result: LocalAxisMetadata = {};
  if (object.x != null) result.x = readNumberArray(object.x, `${path}.x`, context);
  if (object.y != null) result.y = readNumberArray(object.y, `${path}.y`, context);
  if (object.vecxz != null) result.vecxz = readNumberArray(object.vecxz, `${path}.vecxz`, context);
  return result;
}

function parseAnalysisMetadata(
  value: unknown,
  context: ParseContext,
): AnalysisMetadata {
  const path = '$.analysisMetadata';
  const object = readRequiredObject(value, path, context);
  const unitsObject = readObject(object.units, `${path}.units`, context);
  const units: Record<string, string> = {};
  for (const [key, item] of Object.entries(unitsObject)) {
    units[key] = toString_(item, `${path}.units.${key}`, context);
  }

  const constraints = readArray(object.constraints, `${path}.constraints`, context)
    .map((item, index): AnalysisMetadata['constraints'][number] => {
      const itemPath = `${path}.constraints[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const type = toString_(raw.type, `${itemPath}.type`, context, 'equalDOF');
      if (type !== 'equalDOF') invalidValue(context, `${itemPath}.type`, '"equalDOF"', type);
      const constraint: AnalysisMetadata['constraints'][number] = {
        type: 'equalDOF',
        retainedNode: toInt(raw.retainedNode, `${itemPath}.retainedNode`, context),
        constrainedNode: toInt(raw.constrainedNode, `${itemPath}.constrainedNode`, context),
        dofs: readStringArray(raw.dofs, `${itemPath}.dofs`, context),
      };
      const tag = readNumberOrString(raw.tag, `${itemPath}.tag`, context);
      if (tag !== undefined) constraint.tag = tag;
      if (raw.raw != null) constraint.raw = cloneJsonObject(raw.raw, `${itemPath}.raw`, context);
      return constraint;
    });

  const nodalMasses = readArray(object.nodalMasses, `${path}.nodalMasses`, context)
    .map((item, index): AnalysisMetadata['nodalMasses'][number] => {
      const itemPath = `${path}.nodalMasses[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const mass: AnalysisMetadata['nodalMasses'][number] = {
        nodeTag: toInt(raw.nodeTag, `${itemPath}.nodeTag`, context),
        values: readNumberArray(raw.values, `${itemPath}.values`, context),
      };
      if (raw.raw != null) mass.raw = cloneJsonObject(raw.raw, `${itemPath}.raw`, context);
      return mass;
    });

  const linkElements = readArray(object.linkElements, `${path}.linkElements`, context)
    .map((item, index): AnalysisMetadata['linkElements'][number] => {
      const itemPath = `${path}.linkElements[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const link: AnalysisMetadata['linkElements'][number] = {
        tag: toInt(raw.tag, `${itemPath}.tag`, context),
        nodeI: toInt(raw.nodeI, `${itemPath}.nodeI`, context),
        nodeJ: toInt(raw.nodeJ, `${itemPath}.nodeJ`, context),
        directions: readStringArray(raw.directions, `${itemPath}.directions`, context),
        stiffness: readNumberArray(raw.stiffness, `${itemPath}.stiffness`, context),
      };
      if (raw.orientation != null) {
        link.orientation = parseLocalAxisMetadata(raw.orientation, `${itemPath}.orientation`, context);
      }
      if (raw.shearDistance != null) {
        link.shearDistance = readNumberArray(raw.shearDistance, `${itemPath}.shearDistance`, context);
      }
      if (raw.raw != null) link.raw = cloneJsonObject(raw.raw, `${itemPath}.raw`, context);
      return link;
    });

  const localAxesObject = readObject(object.localAxes, `${path}.localAxes`, context);
  const localAxes: Record<string, LocalAxisMetadata> = {};
  for (const [tag, axis] of Object.entries(localAxesObject)) {
    localAxes[tag] = parseLocalAxisMetadata(axis, `${path}.localAxes.${tag}`, context);
  }

  const groups = readArray(object.groups, `${path}.groups`, context)
    .map((item, index): AnalysisMetadata['groups'][number] => {
      const itemPath = `${path}.groups[${index}]`;
      const raw = readRequiredObject(item, itemPath, context);
      const group: AnalysisMetadata['groups'][number] = {
        name: toString_(raw.name, `${itemPath}.name`, context),
        nodeTags: readIntegerArray(raw.nodeTags, `${itemPath}.nodeTags`, context),
        elementTags: readIntegerArray(raw.elementTags, `${itemPath}.elementTags`, context),
      };
      if (hasOwn(raw, 'raw')) group.raw = cloneJsonValue(raw.raw, `${itemPath}.raw`, context);
      return group;
    });

  const metadata: AnalysisMetadata = {
    sourceFormat: toString_(object.sourceFormat, `${path}.sourceFormat`, context),
    schemaVersion: toString_(object.schemaVersion, `${path}.schemaVersion`, context),
    units,
    constraints,
    nodalMasses,
    linkElements,
    localAxes,
    groups,
  };
  if (object.ndm != null) metadata.ndm = toInt(object.ndm, `${path}.ndm`, context);
  if (object.ndf != null) metadata.ndf = toInt(object.ndf, `${path}.ndf`, context);
  if (hasOwn(object, 'resultExtraction')) {
    metadata.resultExtraction = cloneJsonValue(
      object.resultExtraction,
      `${path}.resultExtraction`,
      context,
    );
  }
  if (object.traceability != null) {
    const tracePath = `${path}.traceability`;
    const raw = readRequiredObject(object.traceability, tracePath, context);
    const traceability: NonNullable<AnalysisMetadata['traceability']> = {};
    if (raw.source != null) {
      traceability.source = toString_(raw.source, `${tracePath}.source`, context);
    }
    if (raw.generatedBy != null) {
      traceability.generatedBy = toString_(raw.generatedBy, `${tracePath}.generatedBy`, context);
    }
    if (raw.generatedAt != null) {
      traceability.generatedAt = toString_(raw.generatedAt, `${tracePath}.generatedAt`, context);
    }
    if (hasOwn(raw, 'raw')) traceability.raw = cloneJsonValue(raw.raw, `${tracePath}.raw`, context);
    metadata.traceability = traceability;
  }
  if (object.extensions != null) {
    metadata.extensions = cloneJsonObject(object.extensions, `${path}.extensions`, context);
  }
  return metadata;
}

/** JSONを一時ドキュメントへ読み、成功時だけ対象を置換する。 */
export function parseFrameJson(
  text: string,
  document: FrameDocument,
  options: FrameJsonReadOptions = {},
): FrameJsonParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const migrated = migrateFrameJson(parsed);
  const raw = migrated.document;
  const context: ParseContext = { mode: options.mode ?? 'lenient', diagnostics: [] };
  if (migrated.migratedFrom !== undefined) {
    context.diagnostics.push({
      level: 'info',
      code: 'migrated_format_version',
      path: '$.formatVersion',
      message: `Migrated frame JSON formatVersion ${migrated.migratedFrom} to ${CURRENT_FRAME_JSON_FORMAT_VERSION}.`,
    });
  }
  const temporary = new FrameDocument();

  temporary.title = toString_(raw.title, '$.title', context);
  temporary.nodes = readArray(raw.nodes, '$.nodes', context).map((value, index) => parseNode(value, index, context));
  temporary.boundaries = readArray(raw.boundaries, '$.boundaries', context)
    .map((value, index) => parseBoundary(value, index, context));
  temporary.materials = readArray(raw.materials, '$.materials', context)
    .map((value, index) => parseMaterial(value, index, context));
  temporary.sections = readArray(raw.sections, '$.sections', context)
    .map((value, index) => parseSection(value, index, context));
  temporary.springs = readArray(raw.springs, '$.springs', context)
    .map((value, index) => parseSpring(value, index, context));
  temporary.members = readArray(raw.members, '$.members', context)
    .map((value, index) => parseMember(value, index, context));
  temporary.walls = readArray(raw.walls, '$.walls', context)
    .map((value, index) => parseWall(value, index, context));
  temporary.calcCaseMemo = readArray(raw.calcCaseMemo, '$.calcCaseMemo', context)
    .map((value, index) => toString_(value, `$.calcCaseMemo[${index}]`, context));

  const requestedCount = Math.max(1, toInt(raw.loadCaseCount, '$.loadCaseCount', context, 1));
  temporary.loadCaseCount = Math.max(requestedCount, maxLoadCaseCount(temporary));
  temporary.loadCaseIndex = Math.min(
    Math.max(0, toInt(raw.loadCaseIndex, '$.loadCaseIndex', context)),
    temporary.loadCaseCount - 1,
  );
  temporary.loadCases = parseLoadCases(raw, temporary.loadCaseCount, context);
  temporary.loadCombinations = parseLoadCombinations(raw, context);
  temporary.analysisMetadata = raw.analysisMetadata == null
    ? null
    : parseAnalysisMetadata(raw.analysisMetadata, context);
  for (const node of temporary.nodes) node.setLoadCaseCount(temporary.loadCaseCount);
  for (const member of temporary.members) member.setLoadCaseCount(temporary.loadCaseCount);
  temporary.synchronizeBoundaryConditions();

  document.replaceWith(temporary);
  return {
    formatVersion: CURRENT_FRAME_JSON_FORMAT_VERSION,
    migratedFrom: migrated.migratedFrom,
    diagnostics: context.diagnostics,
  };
}

export function toFrameJson(document: FrameDocument): FrameJsonDocument {
  const loadCaseCount = Math.max(1, document.loadCaseCount, document.loadCases.length);
  const loadCases = Array.from({ length: loadCaseCount }, (_, index) => {
    const loadCase = document.loadCases[index] ?? new LoadCase(`LC${index + 1}`, `Load Case ${index + 1}`);
    return { id: loadCase.id, name: loadCase.name, type: loadCase.type, memo: loadCase.memo };
  });
  return {
    formatVersion: CURRENT_FRAME_JSON_FORMAT_VERSION,
    title: document.title,
    loadCaseCount,
    loadCaseIndex: Math.min(Math.max(0, document.loadCaseIndex), loadCaseCount - 1),
    calcCaseMemo: [...document.calcCaseMemo],
    loadCases,
    loadCombinations: document.loadCombinations.map(combination => ({
      id: combination.id,
      name: combination.name,
      memo: combination.memo,
      terms: combination.terms.map(term => ({ ...term })),
    })),
    analysisMetadata: document.analysisMetadata == null ? null : deepJsonClone(document.analysisMetadata),
    nodes: document.nodes.map(node => ({
      number: node.number,
      x: node.x,
      y: node.y,
      z: node.z,
      temperature: node.temperature,
      intensityGroup: node.intensityGroup,
      longWeight: node.longWeight,
      forceWeight: node.forceWeight,
      addForceWeight: node.addForceWeight,
      area: node.area,
      isShown: node.isShown,
      loads: node.loads.map(load => ({
        p1: load.p1,
        p2: load.p2,
        p3: load.p3,
        m1: load.m1,
        m2: load.m2,
        m3: load.m3,
      })),
    })),
    members: document.members.map(member => ({
      number: member.number,
      iNodeNumber: member.iNodeNumber,
      jNodeNumber: member.jNodeNumber,
      ixSpring: member.ixSpring,
      iySpring: member.iySpring,
      izSpring: member.izSpring,
      jxSpring: member.jxSpring,
      jySpring: member.jySpring,
      jzSpring: member.jzSpring,
      sectionNumber: member.sectionNumber,
      p1: member.p1,
      p2: member.p2,
      p3: member.p3,
      isShown: member.isShown,
      memberLoads: member.memberLoads.map(load => ({
        lengthMethod: load.lengthMethod,
        type: load.type,
        direction: load.direction,
        scale: load.scale,
        loadCode: load.loadCode,
        unitLoad: load.unitLoad,
        p1: load.p1,
        p2: load.p2,
        p3: load.p3,
      })),
      cmqLoads: member.cmqLoads.map(load => ({
        moy: load.moy,
        moz: load.moz,
        iMy: load.iMy,
        iMz: load.iMz,
        iQx: load.iQx,
        iQy: load.iQy,
        iQz: load.iQz,
        jMy: load.jMy,
        jMz: load.jMz,
        jQx: load.jQx,
        jQy: load.jQy,
        jQz: load.jQz,
      })),
    })),
    sections: document.sections.map(section => ({
      number: section.number,
      materialNumber: section.materialNumber,
      type: section.type,
      shape: section.shape,
      p1_A: section.p1_A,
      p2_Ix: section.p2_Ix,
      torsionConstant: section.torsionConstant,
      p3_Iy: section.p3_Iy,
      p4_Iz: section.p4_Iz,
      ky: section.ky,
      kz: section.kz,
      comment: section.comment,
    })),
    materials: document.materials.map(material => ({
      number: material.number,
      young: material.young,
      shear: material.shear,
      expansion: material.expansion,
      poisson: material.poisson,
      unitLoad: material.unitLoad,
      name: material.name,
    })),
    boundaries: document.boundaries.map(boundary => ({
      nodeNumber: boundary.nodeNumber,
      deltaX: boundary.deltaX,
      deltaY: boundary.deltaY,
      deltaZ: boundary.deltaZ,
      thetaX: boundary.thetaX,
      thetaY: boundary.thetaY,
      thetaZ: boundary.thetaZ,
    })),
    springs: document.springs.map(spring => ({
      number: spring.number,
      method: spring.method,
      kTheta: spring.kTheta,
    })),
    walls: document.walls.map(wall => ({
      number: wall.number,
      leftBottomNode: wall.leftBottomNode,
      rightBottomNode: wall.rightBottomNode,
      leftTopNode: wall.leftTopNode,
      rightTopNode: wall.rightTopNode,
      materialNumber: wall.materialNumber,
      method: wall.method,
      p1: wall.p1,
      p2: wall.p2,
      p3: wall.p3,
      p4: wall.p4,
      isShown: wall.isShown,
    })),
  };
}

export function writeFrameJson(document: FrameDocument): string {
  return JSON.stringify(toFrameJson(document), null, 2);
}
