import { Matrix3, Vector3 } from 'three';
import { BoundaryCondition } from '../models/BoundaryCondition';
import { CMQLoad } from '../models/CMQLoad';
import { FrameDocument } from '../models/FrameDocument';
import { MemberLoad } from '../models/MemberLoad';
import { NodeLoad } from '../models/NodeLoad';
import { Wall } from '../models/Wall';
import { resolveLocalAxes } from './LocalAxes';

type Tuple = [number, number, number];
export interface PatternSelection {
  nodes: number[];
  members: number[];
  walls: number[];
}
export type Pattern =
  | { kind: 'linear'; count: number; delta: Tuple }
  | { kind: 'radial'; count: number; axis: 'x' | 'y' | 'z'; angleDegrees: number; origin: Tuple }
  | { kind: 'mirror'; axis: 'x' | 'y' | 'z'; offset: number };

function transform(pattern: Pattern, copy: number) {
  const matrix = new Matrix3().identity();
  const offset = new Vector3();
  if (pattern.kind === 'linear') offset.fromArray(pattern.delta).multiplyScalar(copy);
  else if (pattern.kind === 'mirror') {
    const index = { x: 0, y: 1, z: 2 }[pattern.axis];
    matrix.elements[index * 4] = -1;
    offset.setComponent(index, 2 * pattern.offset);
  } else {
    const angle = (pattern.angleDegrees * copy * Math.PI) / 180;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (pattern.axis === 'x') matrix.set(1, 0, 0, 0, c, -s, 0, s, c);
    else if (pattern.axis === 'y') matrix.set(c, 0, s, 0, 1, 0, -s, 0, c);
    else matrix.set(c, -s, 0, s, c, 0, 0, 0, 1);
    const origin = new Vector3(...pattern.origin);
    offset.copy(origin).sub(origin.clone().applyMatrix3(matrix));
  }
  return { matrix, offset };
}

function transformSupports(boundary: BoundaryCondition, matrix: Matrix3): void {
  for (const keys of [
    ['deltaX', 'deltaY', 'deltaZ'],
    ['thetaX', 'thetaY', 'thetaZ'],
  ] as const) {
    const values = keys.map((key) => boundary[key]);
    if (values.every((value) => value === values[0])) continue;
    const result = [0, 0, 0];
    for (let input = 0; input < 3; input++) {
      const vector = new Vector3().setComponent(input, 1).applyMatrix3(matrix);
      const output = [vector.x, vector.y, vector.z].findIndex(
        (value) => Math.abs(Math.abs(value) - 1) < 1e-9,
      );
      if (output < 0) throw new Error('Rotating directional supports requires a multiple of 90 degrees.');
      result[output] = values[input];
    }
    keys.forEach((key, i) => {
      boundary[key] = result[i];
    });
  }
}

/** Call within EditorController.execute; unsupported semantics are rejected before copying. */
export function replicatePattern(
  doc: FrameDocument,
  selection: PatternSelection,
  pattern: Pattern,
): PatternSelection {
  const count = pattern.kind === 'mirror' ? 1 : pattern.count;
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Copy count must be 1–1000.');
  const values =
    pattern.kind === 'linear'
      ? pattern.delta
      : pattern.kind === 'radial'
        ? [...pattern.origin, pattern.angleDegrees]
        : [pattern.offset];
  if (!values.every(Number.isFinite)) throw new Error('Pattern coordinates must be finite.');
  if (pattern.kind !== 'linear' && !['x', 'y', 'z'].includes(pattern.axis)) throw new Error('Invalid axis.');
  const memberNumbers = new Set(selection.members);
  const wallNumbers = new Set(selection.walls);
  const members = doc.members.filter((item) => memberNumbers.has(item.number));
  const walls = doc.walls.filter((item) => wallNumbers.has(item.number));
  const nodeNumbers = new Set([
    ...selection.nodes,
    ...members.flatMap((item) => [item.iNodeNumber, item.jNodeNumber]),
    ...walls.flatMap((item) => [
      item.leftBottomNode,
      item.rightBottomNode,
      item.leftTopNode,
      item.rightTopNode,
    ]),
  ]);
  const nodes = [...nodeNumbers].map((number) => doc.findNodeByNumber(number));
  if (
    members.length !== memberNumbers.size ||
    walls.length !== wallNumbers.size ||
    nodes.some((node) => !node) ||
    !nodes.length
  )
    throw new Error('Invalid or empty selection.');
  if (!doc.analysisMetadata && pattern.kind !== 'linear')
    doc.analysisMetadata = {
      sourceFormat: 'framemodelmaker',
      schemaVersion: '1',
      units: { length: 'cm', force: 'kN' },
      constraints: [],
      nodalMasses: [],
      linkElements: [],
      localAxes: {},
      groups: [],
    };
  const metadata = doc.analysisMetadata;
  if (
    metadata &&
    (metadata.constraints.length ||
      metadata.nodalMasses.length ||
      metadata.linkElements.length ||
      metadata.resultExtraction ||
      metadata.extensions)
  ) {
    throw new Error(
      'This model contains constraints, masses, links or opaque analysis data. Pattern copying requires an explicit adapter for these records.',
    );
  }
  if (
    pattern.kind !== 'linear' &&
    (members.some(
      (member) =>
        member.memberLoads.some((load) => !load.isZero) || member.cmqLoads.some((load) => !load.isZero),
    ) ||
      walls.length)
  ) {
    throw new Error(
      'Rotating/mirroring member loads, CMQ values or wall parameters has no defined convention. Use linear copies.',
    );
  }
  const originalBoundaries = doc.boundaries.filter((boundary) => nodeNumbers.has(boundary.nodeNumber));
  const transforms = Array.from({ length: count }, (_, i) => transform(pattern, i + 1));
  // Validate all rotations of supports before changing the document.
  for (const { matrix } of transforms)
    for (const source of originalBoundaries)
      transformSupports(Object.assign(new BoundaryCondition(), source), matrix);
  const output: PatternSelection = { nodes: [], members: [], walls: [] };
  for (const { matrix, offset } of transforms) {
    const remap = new Map<number, number>();
    const memberMap = new Map<number, number>();
    for (const source of nodes) {
      const node = doc.createNode();
      const number = doc.newNodeNumber;
      Object.assign(node, source!);
      node.number = number;
      node.selected = false;
      node.boundaryCondition = null;
      const point = new Vector3(source!.x, source!.y, source!.z).applyMatrix3(matrix).add(offset);
      [node.x, node.y, node.z] = point.toArray();
      node.loads = source!.loads.map((load) => {
        const copy = Object.assign(new NodeLoad(), load);
        [copy.p1, copy.p2, copy.p3] = new Vector3(load.p1, load.p2, load.p3).applyMatrix3(matrix).toArray();
        [copy.m1, copy.m2, copy.m3] = new Vector3(load.m1, load.m2, load.m3)
          .applyMatrix3(matrix)
          .multiplyScalar(matrix.determinant())
          .toArray();
        return copy;
      });
      doc.addNode(node);
      remap.set(source!.number, number);
      output.nodes.push(number);
    }
    for (const source of originalBoundaries) {
      const boundary = Object.assign(new BoundaryCondition(), source, {
        nodeNumber: remap.get(source.nodeNumber)!,
      });
      transformSupports(boundary, matrix);
      doc.boundaries.push(boundary);
    }
    for (const source of members) {
      const member = doc.createMember();
      const number = doc.newMemberNumber;
      Object.assign(member, source, {
        number,
        selected: false,
        iNodeNumber: remap.get(source.iNodeNumber),
        jNodeNumber: remap.get(source.jNodeNumber),
      });
      member.memberLoads = source.memberLoads.map((load) => Object.assign(new MemberLoad(), load));
      member.cmqLoads = source.cmqLoads.map((load) => Object.assign(new CMQLoad(), load));
      doc.addMember(member);
      memberMap.set(source.number, number);
      output.members.push(number);
      if (metadata && (pattern.kind !== 'linear' || metadata.localAxes[String(source.number)])) {
        const axis = resolveLocalAxes(
          doc.findNodeByNumber(source.iNodeNumber)!,
          doc.findNodeByNumber(source.jNodeNumber)!,
          metadata.localAxes[String(source.number)],
        );
        metadata.localAxes[String(number)] = {
          x: new Vector3(...axis.x).applyMatrix3(matrix).toArray(),
          y: new Vector3(...axis.y).applyMatrix3(matrix).toArray(),
        };
      }
    }
    for (const source of walls) {
      const number = Math.max(0, ...doc.walls.map((wall) => wall.number)) + 1;
      const wall = Object.assign(new Wall(), source, { number });
      for (const key of ['leftBottomNode', 'rightBottomNode', 'leftTopNode', 'rightTopNode'] as const)
        wall[key] = remap.get(source[key])!;
      doc.walls.push(wall);
      output.walls.push(number);
    }
    for (const group of metadata?.groups ?? []) {
      group.nodeTags.push(
        ...group.nodeTags.flatMap((number) => (remap.has(number) ? [remap.get(number)!] : [])),
      );
      group.elementTags.push(
        ...group.elementTags.flatMap((number) => (memberMap.has(number) ? [memberMap.get(number)!] : [])),
      );
    }
  }
  doc.synchronizeBoundaryConditions();
  return output;
}

export function generateFrame(
  doc: FrameDocument,
  options: {
    kind: 'frame' | 'truss';
    spans: number;
    stories: number;
    span: number;
    height: number;
    sectionNumber: number;
  },
): void {
  const { spans, stories, span, height, sectionNumber } = options;
  if (
    ![spans, stories].every((value) => Number.isInteger(value) && value > 0 && value <= 100) ||
    ![span, height].every((value) => Number.isFinite(value) && value > 0) ||
    !doc.findSectionByNumber(sectionNumber)
  )
    throw new Error('Invalid template dimensions or section.');
  const nodes: number[][] = [];
  for (let story = 0; story <= stories; story++) {
    nodes[story] = [];
    for (let bay = 0; bay <= spans; bay++)
      nodes[story].push(doc.addNode(doc.createNode(bay * span, 0, story * height)).number);
  }
  const connect = (i: number, j: number) => {
    const member = doc.createMember();
    member.iNodeNumber = i;
    member.jNodeNumber = j;
    member.sectionNumber = sectionNumber;
    doc.addMember(member);
  };
  for (let story = 0; story <= stories; story++)
    for (let bay = 0; bay <= spans; bay++) {
      if (story > 0) connect(nodes[story - 1][bay], nodes[story][bay]);
      if (bay < spans && (story > 0 || options.kind === 'truss'))
        connect(nodes[story][bay], nodes[story][bay + 1]);
      if (options.kind === 'truss' && story > 0 && bay < spans)
        connect(nodes[story - 1][bay], nodes[story][bay + 1]);
    }
}
