import { BoundaryCondition } from '../models/BoundaryCondition';
import { CMQLoad } from '../models/CMQLoad';
import { FrameDocument } from '../models/FrameDocument';
import { LoadCase, LoadCaseType } from '../models/LoadCase';
import { LoadCombination } from '../models/LoadCombination';
import { Material } from '../models/Material';
import { Member } from '../models/Member';
import { MemberLoad } from '../models/MemberLoad';
import { Node } from '../models/Node';
import { NodeLoad } from '../models/NodeLoad';
import { Section, SectionShape, SectionType } from '../models/Section';
import { Spring } from '../models/Spring';
import { Wall } from '../models/Wall';

import { parseAnalysisMetadata } from './FrameJsonMetadata';
import { migrateFrameJson } from './FrameJsonMigration';
import {
  CURRENT_FRAME_JSON_FORMAT_VERSION,
  FrameJsonParseResult,
  FrameJsonReadOptions,
  JsonObject,
  ParseContext,
} from './FrameJsonTypes';
import { readArray, readRequiredObject, toBoolean, toInt, toNumber, toString_ } from './FrameJsonValues';
export { migrateFrameJson } from './FrameJsonMigration';
export * from './FrameJsonTypes';
export { toFrameJson, writeFrameJson } from './FrameJsonWriter';

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
    'moy',
    'moz',
    'iMy',
    'iMz',
    'iQx',
    'iQy',
    'iQz',
    'jMy',
    'jMz',
    'jQx',
    'jQy',
    'jQz',
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
  node.loads = readArray(object.loads, `${path}.loads`, context).map((load, loadIndex) =>
    parseNodeLoad(load, `${path}.loads[${loadIndex}]`, context),
  );
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
  member.memberLoads = readArray(object.memberLoads, `${path}.memberLoads`, context).map((load, loadIndex) =>
    parseMemberLoad(load, `${path}.memberLoads[${loadIndex}]`, context),
  );
  member.cmqLoads = readArray(object.cmqLoads, `${path}.cmqLoads`, context).map((load, loadIndex) =>
    parseCMQLoad(load, `${path}.cmqLoads[${loadIndex}]`, context),
  );
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
  let count = 1;
  for (const node of document.nodes) count = Math.max(count, node.loads.length);
  for (const member of document.members) {
    count = Math.max(count, member.memberLoads.length, member.cmqLoads.length);
  }
  return count;
}

function parseLoadCases(raw: JsonObject, count: number, context: ParseContext): LoadCase[] {
  const values = readArray(raw.loadCases, '$.loadCases', context);
  const result: LoadCase[] = [];
  const used = new Set<string>();
  for (let index = 0; index < count; index++) {
    const object =
      index < values.length ? readRequiredObject(values[index], `$.loadCases[${index}]`, context) : {};
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
    result.push(
      new LoadCase(
        id,
        toString_(object.name, `$.loadCases[${index}].name`, context, `Load Case ${index + 1}`),
        toString_(object.type, `$.loadCases[${index}].type`, context, LoadCaseType.Other),
        toString_(object.memo, `$.loadCases[${index}].memo`, context),
      ),
    );
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
  temporary.nodes = readArray(raw.nodes, '$.nodes', context).map((value, index) =>
    parseNode(value, index, context),
  );
  temporary.boundaries = readArray(raw.boundaries, '$.boundaries', context).map((value, index) =>
    parseBoundary(value, index, context),
  );
  temporary.materials = readArray(raw.materials, '$.materials', context).map((value, index) =>
    parseMaterial(value, index, context),
  );
  temporary.sections = readArray(raw.sections, '$.sections', context).map((value, index) =>
    parseSection(value, index, context),
  );
  temporary.springs = readArray(raw.springs, '$.springs', context).map((value, index) =>
    parseSpring(value, index, context),
  );
  temporary.members = readArray(raw.members, '$.members', context).map((value, index) =>
    parseMember(value, index, context),
  );
  temporary.walls = readArray(raw.walls, '$.walls', context).map((value, index) =>
    parseWall(value, index, context),
  );
  temporary.calcCaseMemo = readArray(raw.calcCaseMemo, '$.calcCaseMemo', context).map((value, index) =>
    toString_(value, `$.calcCaseMemo[${index}]`, context),
  );

  const requestedCount = Math.max(1, toInt(raw.loadCaseCount, '$.loadCaseCount', context, 1));
  const namedLoadCaseCount = Array.isArray(raw.loadCases) ? raw.loadCases.length : 0;
  temporary.loadCaseCount = Math.max(requestedCount, namedLoadCaseCount, maxLoadCaseCount(temporary));
  temporary.loadCaseIndex = Math.min(
    Math.max(0, toInt(raw.loadCaseIndex, '$.loadCaseIndex', context)),
    temporary.loadCaseCount - 1,
  );
  temporary.loadCases = parseLoadCases(raw, temporary.loadCaseCount, context);
  temporary.loadCombinations = parseLoadCombinations(raw, context);
  temporary.analysisMetadata =
    raw.analysisMetadata == null ? null : parseAnalysisMetadata(raw.analysisMetadata, context);
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
