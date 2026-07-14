export interface ResultVector3 {
  x: number;
  y: number;
  z: number;
}

export interface ResultForce6 {
  axial: number;
  shearY: number;
  shearZ: number;
  torsion: number;
  momentY: number;
  momentZ: number;
}

export interface NodeAnalysisResult {
  nodeNumber: number;
  displacement: ResultVector3;
  rotation: ResultVector3;
  reaction?: ResultForce6;
}

export interface MemberAnalysisResult {
  memberNumber: number;
  iEnd: ResultForce6;
  jEnd: ResultForce6;
}

export interface AnalysisResultFrame {
  time: number;
  nodes: NodeAnalysisResult[];
  members: MemberAnalysisResult[];
}

export interface AnalysisResultUnits {
  length: 'cm';
  force: 'kN';
  moment: 'kN-cm';
  time?: string;
}

export interface AnalysisResult {
  formatVersion: 1;
  title: string;
  units: AnalysisResultUnits;
  coordinateSystem: 'global-xyz';
  nodeReactionSystem: 'global-xyz';
  memberForceSystem: 'local-xyz';
  loadCaseId?: string;
  combinationId?: string;
  frames: AnalysisResultFrame[];
  metadata?: Record<string, string | number | boolean | null>;
}

type RawObject = Record<string, unknown>;

function object(value: unknown): RawObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RawObject : {};
}

function requiredObject(value: unknown, path: string): RawObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as RawObject;
  throw new Error(`Invalid analysis result: ${path} must be an object.`);
}

function optionalArray(value: unknown, path: string): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  throw new Error(`Invalid analysis result: ${path} must be an array.`);
}

function requiredConvention<T extends string>(
  value: unknown,
  path: string,
  expected: T,
): T {
  if (value !== expected) {
    throw new Error(`Invalid analysis result: ${path} must be "${expected}"; values are not converted.`);
  }
  return expected;
}

function finite(value: unknown, path: string, fallback = 0): number {
  if (value == null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid analysis result: ${path} must be a finite number.`);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  const number = finite(value, path);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Invalid analysis result: ${path} must be a positive integer.`);
  }
  return number;
}

function vector(value: unknown, path: string): ResultVector3 {
  if (value != null && !Array.isArray(value) && (typeof value !== 'object' || value === null)) {
    throw new Error(`Invalid analysis result: ${path} must be an object or a three-value array.`);
  }
  if (Array.isArray(value) && value.length !== 3) {
    throw new Error(`Invalid analysis result: ${path} must contain exactly three values.`);
  }
  const raw = object(value);
  const values = Array.isArray(value) ? value : [];
  return {
    x: finite(raw.x ?? values[0], `${path}.x`),
    y: finite(raw.y ?? values[1], `${path}.y`),
    z: finite(raw.z ?? values[2], `${path}.z`),
  };
}

function force(value: unknown, path: string): ResultForce6 {
  if (value != null && !Array.isArray(value) && (typeof value !== 'object' || value === null)) {
    throw new Error(`Invalid analysis result: ${path} must be an object or a six-value array.`);
  }
  if (Array.isArray(value) && value.length !== 6) {
    throw new Error(`Invalid analysis result: ${path} must contain exactly six values.`);
  }
  const raw = object(value);
  const values = Array.isArray(value) ? value : [];
  return {
    axial: finite(raw.axial ?? raw.n ?? values[0], `${path}.axial`),
    shearY: finite(raw.shearY ?? raw.qy ?? values[1], `${path}.shearY`),
    shearZ: finite(raw.shearZ ?? raw.qz ?? values[2], `${path}.shearZ`),
    torsion: finite(raw.torsion ?? raw.mx ?? values[3], `${path}.torsion`),
    momentY: finite(raw.momentY ?? raw.my ?? values[4], `${path}.momentY`),
    momentZ: finite(raw.momentZ ?? raw.mz ?? values[5], `${path}.momentZ`),
  };
}

function parseFrame(value: unknown, index: number): AnalysisResultFrame {
  const framePath = `frames[${index}]`;
  const raw = requiredObject(value, framePath);
  const nodes = optionalArray(raw.nodes ?? raw.nodeResults, `${framePath}.nodes`).map((item, nodeIndex) => {
    const node = requiredObject(item, `${framePath}.nodes[${nodeIndex}]`);
    const result: NodeAnalysisResult = {
      nodeNumber: integer(node.nodeNumber ?? node.node ?? node.tag, `frames[${index}].nodes[${nodeIndex}].nodeNumber`),
      displacement: vector(node.displacement ?? node.translation, `frames[${index}].nodes[${nodeIndex}].displacement`),
      rotation: vector(node.rotation, `frames[${index}].nodes[${nodeIndex}].rotation`),
    };
    if (node.reaction != null) result.reaction = force(node.reaction, `frames[${index}].nodes[${nodeIndex}].reaction`);
    return result;
  });
  const members = optionalArray(raw.members ?? raw.memberResults, `${framePath}.members`).map((item, memberIndex) => {
    const member = requiredObject(item, `${framePath}.members[${memberIndex}]`);
    return {
      memberNumber: integer(member.memberNumber ?? member.member ?? member.tag, `frames[${index}].members[${memberIndex}].memberNumber`),
      iEnd: force(member.iEnd ?? member.i, `frames[${index}].members[${memberIndex}].iEnd`),
      jEnd: force(member.jEnd ?? member.j, `frames[${index}].members[${memberIndex}].jEnd`),
    };
  });
  const duplicateNode = nodes.find((node, nodeIndex) => nodes.findIndex(item => item.nodeNumber === node.nodeNumber) !== nodeIndex);
  if (duplicateNode) throw new Error(`Invalid analysis result: ${framePath} duplicates node ${duplicateNode.nodeNumber}.`);
  const duplicateMember = members.find((member, memberIndex) => members.findIndex(item => item.memberNumber === member.memberNumber) !== memberIndex);
  if (duplicateMember) throw new Error(`Invalid analysis result: ${framePath} duplicates member ${duplicateMember.memberNumber}.`);
  return { time: finite(raw.time, `${framePath}.time`, index), nodes, members };
}

/** 静的1フレームと時刻歴framesの両方を受け付ける非破壊パーサ。 */
export function parseAnalysisResult(text: string): AnalysisResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid analysis result JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const raw = object(value);
  if (Object.keys(raw).length === 0) throw new Error('Invalid analysis result: root must be an object.');
  const version = raw.formatVersion == null ? 1 : finite(raw.formatVersion, 'formatVersion');
  if (version !== 1) throw new Error(`Unsupported analysis result formatVersion ${version}.`);
  const hasFrames = Object.prototype.hasOwnProperty.call(raw, 'frames');
  let frameValues: unknown[];
  if (hasFrames) {
    if (!Array.isArray(raw.frames)) throw new Error('Invalid analysis result: frames must be an array.');
    frameValues = raw.frames;
  } else if (
    Object.prototype.hasOwnProperty.call(raw, 'nodes')
    || Object.prototype.hasOwnProperty.call(raw, 'nodeResults')
    || Object.prototype.hasOwnProperty.call(raw, 'members')
    || Object.prototype.hasOwnProperty.call(raw, 'memberResults')
  ) {
    frameValues = [{ time: 0, nodes: raw.nodes ?? raw.nodeResults, members: raw.members ?? raw.memberResults }];
  } else {
    throw new Error('Invalid analysis result: frames or static nodes/members are required.');
  }
  const frames = frameValues.map(parseFrame).sort((a, b) => a.time - b.time);
  if (frames.length === 0) throw new Error('Invalid analysis result: at least one frame is required.');
  const unitsRaw = object(raw.units);
  const units: AnalysisResultUnits = {
    length: requiredConvention(unitsRaw.length, 'units.length', 'cm'),
    force: requiredConvention(unitsRaw.force, 'units.force', 'kN'),
    moment: requiredConvention(unitsRaw.moment, 'units.moment', 'kN-cm'),
    ...(typeof unitsRaw.time === 'string' && unitsRaw.time.trim() !== '' ? { time: unitsRaw.time } : {}),
  };
  const metadataRaw = raw.metadata == null ? {} : requiredObject(raw.metadata, 'metadata');
  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(metadataRaw)) {
    if (item == null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) {
      metadata[key] = item as string | number | boolean | null;
    }
  }
  return {
    formatVersion: 1,
    title: typeof raw.title === 'string' ? raw.title : '',
    units,
    coordinateSystem: requiredConvention(raw.coordinateSystem, 'coordinateSystem', 'global-xyz'),
    nodeReactionSystem: requiredConvention(raw.nodeReactionSystem, 'nodeReactionSystem', 'global-xyz'),
    memberForceSystem: requiredConvention(raw.memberForceSystem, 'memberForceSystem', 'local-xyz'),
    ...(typeof raw.loadCaseId === 'string' ? { loadCaseId: raw.loadCaseId } : {}),
    ...(typeof raw.combinationId === 'string' ? { combinationId: raw.combinationId } : {}),
    frames,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

export function writeAnalysisResult(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
