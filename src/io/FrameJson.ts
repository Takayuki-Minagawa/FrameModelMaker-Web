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

type JsonObject = Record<string, unknown>;

export interface FrameJsonDocument {
  title: string;
  loadCaseCount: number;
  loadCaseIndex: number;
  calcCaseMemo: string[];
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
    loads: Array<{
      p1: number;
      p2: number;
      p3: number;
      m1: number;
      m2: number;
      m3: number;
    }>;
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
    p2_Ix: number;
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
  springs: Array<{
    number: number;
    method: number;
    kTheta: number;
  }>;
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
  }>;
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toInt(value: unknown): number {
  return Math.trunc(toNumber(value));
}

function toString_(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function parseNodeLoad(value: unknown): NodeLoad {
  const obj = asObject(value);
  const load = new NodeLoad();
  load.p1 = toNumber(obj.p1);
  load.p2 = toNumber(obj.p2);
  load.p3 = toNumber(obj.p3);
  load.m1 = toNumber(obj.m1);
  load.m2 = toNumber(obj.m2);
  load.m3 = toNumber(obj.m3);
  return load;
}

function parseMemberLoad(value: unknown): MemberLoad {
  const obj = asObject(value);
  const load = new MemberLoad();
  load.lengthMethod = toInt(obj.lengthMethod);
  load.type = toInt(obj.type);
  load.direction = toInt(obj.direction);
  load.scale = toNumber(obj.scale);
  load.loadCode = toString_(obj.loadCode);
  load.unitLoad = toNumber(obj.unitLoad);
  load.p1 = toNumber(obj.p1);
  load.p2 = toNumber(obj.p2);
  load.p3 = toNumber(obj.p3);
  return load;
}

function parseCMQLoad(value: unknown): CMQLoad {
  const obj = asObject(value);
  const load = new CMQLoad();
  load.moy = toNumber(obj.moy);
  load.moz = toNumber(obj.moz);
  load.iMy = toNumber(obj.iMy);
  load.iMz = toNumber(obj.iMz);
  load.iQx = toNumber(obj.iQx);
  load.iQy = toNumber(obj.iQy);
  load.iQz = toNumber(obj.iQz);
  load.jMy = toNumber(obj.jMy);
  load.jMz = toNumber(obj.jMz);
  load.jQx = toNumber(obj.jQx);
  load.jQy = toNumber(obj.jQy);
  load.jQz = toNumber(obj.jQz);
  return load;
}

function parseNode(value: unknown): Node {
  const obj = asObject(value);
  const node = new Node();
  node.number = toInt(obj.number);
  node.x = toNumber(obj.x);
  node.y = toNumber(obj.y);
  node.z = toNumber(obj.z);
  node.temperature = toNumber(obj.temperature);
  node.intensityGroup = toInt(obj.intensityGroup);
  node.longWeight = toNumber(obj.longWeight);
  node.forceWeight = toNumber(obj.forceWeight);
  node.addForceWeight = toNumber(obj.addForceWeight);
  node.area = toNumber(obj.area);
  node.loads = asArray(obj.loads).map(parseNodeLoad);
  node.selected = toBoolean(obj.selected, false);
  node.isShown = toBoolean(obj.isShown, true);
  return node;
}

function parseBoundary(value: unknown): BoundaryCondition {
  const obj = asObject(value);
  const boundary = new BoundaryCondition();
  boundary.nodeNumber = toInt(obj.nodeNumber);
  boundary.deltaX = toInt(obj.deltaX);
  boundary.deltaY = toInt(obj.deltaY);
  boundary.deltaZ = toInt(obj.deltaZ);
  boundary.thetaX = toInt(obj.thetaX);
  boundary.thetaY = toInt(obj.thetaY);
  boundary.thetaZ = toInt(obj.thetaZ);
  return boundary;
}

function parseMaterial(value: unknown): Material {
  const obj = asObject(value);
  const material = new Material();
  material.number = toInt(obj.number);
  material.young = toNumber(obj.young);
  material.shear = toNumber(obj.shear);
  material.expansion = toNumber(obj.expansion);
  material.poisson = toNumber(obj.poisson);
  material.unitLoad = toNumber(obj.unitLoad);
  material.name = toString_(obj.name);
  return material;
}

function parseSection(value: unknown): Section {
  const obj = asObject(value);
  const section = new Section();
  section.number = toInt(obj.number);
  section.materialNumber = toInt(obj.materialNumber);
  section.type = toInt(obj.type) as SectionType;
  section.shape = toInt(obj.shape) as SectionShape;
  section.p1_A = toNumber(obj.p1_A);
  section.p2_Ix = toNumber(obj.p2_Ix);
  section.p3_Iy = toNumber(obj.p3_Iy);
  section.p4_Iz = toNumber(obj.p4_Iz);
  section.ky = toNumber(obj.ky);
  section.kz = toNumber(obj.kz);
  section.comment = toString_(obj.comment);
  return section;
}

function parseSpring(value: unknown): Spring {
  const obj = asObject(value);
  const spring = new Spring();
  spring.number = toInt(obj.number);
  spring.method = toInt(obj.method);
  spring.kTheta = toNumber(obj.kTheta);
  return spring;
}

function parseMember(value: unknown): Member {
  const obj = asObject(value);
  const member = new Member();
  member.number = toInt(obj.number);
  member.iNodeNumber = toInt(obj.iNodeNumber);
  member.jNodeNumber = toInt(obj.jNodeNumber);
  member.ixSpring = toInt(obj.ixSpring);
  member.iySpring = toInt(obj.iySpring);
  member.izSpring = toInt(obj.izSpring);
  member.jxSpring = toInt(obj.jxSpring);
  member.jySpring = toInt(obj.jySpring);
  member.jzSpring = toInt(obj.jzSpring);
  member.sectionNumber = toInt(obj.sectionNumber);
  member.p1 = toNumber(obj.p1);
  member.p2 = toNumber(obj.p2);
  member.p3 = toNumber(obj.p3);
  member.memberLoads = asArray(obj.memberLoads).map(parseMemberLoad);
  member.cmqLoads = asArray(obj.cmqLoads).map(parseCMQLoad);
  member.selected = toBoolean(obj.selected, false);
  member.isShown = toBoolean(obj.isShown, true);
  return member;
}

function parseWall(value: unknown): Wall {
  const obj = asObject(value);
  const wall = new Wall();
  wall.number = toInt(obj.number);
  wall.leftBottomNode = toInt(obj.leftBottomNode);
  wall.rightBottomNode = toInt(obj.rightBottomNode);
  wall.leftTopNode = toInt(obj.leftTopNode);
  wall.rightTopNode = toInt(obj.rightTopNode);
  wall.materialNumber = toInt(obj.materialNumber);
  wall.method = toInt(obj.method);
  wall.p1 = toNumber(obj.p1);
  wall.p2 = toNumber(obj.p2);
  wall.p3 = toNumber(obj.p3);
  wall.p4 = toNumber(obj.p4);
  wall.isShown = toBoolean(obj.isShown, true);
  return wall;
}

function maxLoadCaseCount(doc: FrameDocument): number {
  const nodeCases = doc.nodes.map(n => n.loads.length);
  const memberCases = doc.members.flatMap(m => [m.memberLoads.length, m.cmqLoads.length]);
  return Math.max(1, ...nodeCases, ...memberCases);
}

export function parseFrameJson(text: string, doc: FrameDocument): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid JSON: root must be an object');
  }

  const raw = parsed as JsonObject;
  doc.init();

  doc.title = toString_(raw.title);
  doc.nodes = asArray(raw.nodes).map(parseNode);
  doc.boundaries = asArray(raw.boundaries).map(parseBoundary);
  doc.materials = asArray(raw.materials).map(parseMaterial);
  doc.sections = asArray(raw.sections).map(parseSection);
  doc.springs = asArray(raw.springs).map(parseSpring);
  doc.members = asArray(raw.members).map(parseMember);
  doc.walls = asArray(raw.walls).map(parseWall);
  doc.calcCaseMemo = asArray(raw.calcCaseMemo).map(toString_);

  const requestedLoadCaseCount = Math.max(1, toInt(raw.loadCaseCount));
  doc.loadCaseCount = Math.max(requestedLoadCaseCount, maxLoadCaseCount(doc));
  doc.loadCaseIndex = Math.min(
    Math.max(0, toInt(raw.loadCaseIndex)),
    doc.loadCaseCount - 1,
  );

  for (const node of doc.nodes) node.setLoadCaseCount(doc.loadCaseCount);
  for (const member of doc.members) member.setLoadCaseCount(doc.loadCaseCount);

  const nodeMap = new Map(doc.nodes.map(node => [node.number, node] as const));
  for (const boundary of doc.boundaries) {
    const node = nodeMap.get(boundary.nodeNumber);
    if (node) node.boundaryCondition = boundary;
  }

  doc.notifyChange();
}

export function toFrameJson(doc: FrameDocument): FrameJsonDocument {
  return {
    title: doc.title,
    loadCaseCount: doc.loadCaseCount,
    loadCaseIndex: doc.loadCaseIndex,
    calcCaseMemo: [...doc.calcCaseMemo],
    nodes: doc.nodes.map(node => ({
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
      loads: node.loads.map(load => ({
        p1: load.p1,
        p2: load.p2,
        p3: load.p3,
        m1: load.m1,
        m2: load.m2,
        m3: load.m3,
      })),
    })),
    members: doc.members.map(member => ({
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
    sections: doc.sections.map(section => ({
      number: section.number,
      materialNumber: section.materialNumber,
      type: section.type,
      shape: section.shape,
      p1_A: section.p1_A,
      p2_Ix: section.p2_Ix,
      p3_Iy: section.p3_Iy,
      p4_Iz: section.p4_Iz,
      ky: section.ky,
      kz: section.kz,
      comment: section.comment,
    })),
    materials: doc.materials.map(material => ({
      number: material.number,
      young: material.young,
      shear: material.shear,
      expansion: material.expansion,
      poisson: material.poisson,
      unitLoad: material.unitLoad,
      name: material.name,
    })),
    boundaries: doc.boundaries.map(boundary => ({
      nodeNumber: boundary.nodeNumber,
      deltaX: boundary.deltaX,
      deltaY: boundary.deltaY,
      deltaZ: boundary.deltaZ,
      thetaX: boundary.thetaX,
      thetaY: boundary.thetaY,
      thetaZ: boundary.thetaZ,
    })),
    springs: doc.springs.map(spring => ({
      number: spring.number,
      method: spring.method,
      kTheta: spring.kTheta,
    })),
    walls: doc.walls.map(wall => ({
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
    })),
  };
}

export function writeFrameJson(doc: FrameDocument): string {
  return JSON.stringify(toFrameJson(doc), null, 2);
}
