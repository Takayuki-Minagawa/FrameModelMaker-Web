import { FrameDocument } from '../models/FrameDocument';
import { Member } from '../models/Member';
import { SectionShape, SectionType } from '../models/Section';
import { Spring } from '../models/Spring';

export type FrameValidationSeverity = 'error' | 'warning' | 'info';
export type FrameEntityKind =
  | 'document'
  | 'node'
  | 'member'
  | 'section'
  | 'material'
  | 'spring'
  | 'wall'
  | 'boundary'
  | 'loadCase'
  | 'loadCombination';

export interface FrameValidationEntity {
  kind: FrameEntityKind;
  number?: number;
  id?: string;
  index?: number;
  field?: string;
}

export interface FrameValidationDiagnostic {
  severity: FrameValidationSeverity;
  code: string;
  message: string;
  entity: FrameValidationEntity;
  related?: FrameValidationEntity[];
}

export interface FrameValidationResult {
  diagnostics: FrameValidationDiagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  isValid: boolean;
}

export interface FrameValidatorOptions {
  zeroLengthTolerance?: number;
  isolatedNodeSeverity?: Exclude<FrameValidationSeverity, 'error'>;
}

interface DiagnosticSink {
  add(
    severity: FrameValidationSeverity,
    code: string,
    message: string,
    entity: FrameValidationEntity,
    related?: FrameValidationEntity[],
  ): void;
}

function entity(kind: FrameEntityKind, number?: number, index?: number, field?: string): FrameValidationEntity {
  return {
    kind,
    ...(number !== undefined ? { number } : {}),
    ...(index !== undefined ? { index } : {}),
    ...(field !== undefined ? { field } : {}),
  };
}

function validateNumbers<T extends { number: number }>(
  items: readonly T[],
  kind: Exclude<FrameEntityKind, 'document' | 'boundary' | 'loadCase' | 'loadCombination'>,
  sink: DiagnosticSink,
): void {
  const indexesByNumber = new Map<number, number[]>();
  items.forEach((item, index) => {
    if (!Number.isFinite(item.number) || !Number.isInteger(item.number) || item.number <= 0) {
      sink.add('error', 'invalid_number', `${kind} number must be a positive integer.`, entity(kind, item.number, index, 'number'));
    }
    const indexes = indexesByNumber.get(item.number) ?? [];
    indexes.push(index);
    indexesByNumber.set(item.number, indexes);
  });
  for (const [number, indexes] of indexesByNumber) {
    if (indexes.length <= 1) continue;
    sink.add(
      'error',
      'duplicate_number',
      `${kind} number ${number} is duplicated ${indexes.length} times.`,
      entity(kind, number, indexes[0], 'number'),
      indexes.slice(1).map(index => entity(kind, number, index, 'number')),
    );
  }
}

function checkFinite(
  value: number,
  field: string,
  itemEntity: FrameValidationEntity,
  sink: DiagnosticSink,
): void {
  if (!Number.isFinite(value)) {
    sink.add('error', 'non_finite_value', `${field} must be finite.`, { ...itemEntity, field });
  }
}

function memberLength(member: Member, nodeByNumber: Map<number, { x: number; y: number; z: number }>): number | undefined {
  const iNode = nodeByNumber.get(member.iNodeNumber);
  const jNode = nodeByNumber.get(member.jNodeNumber);
  if (!iNode || !jNode) return undefined;
  return Math.hypot(iNode.x - jNode.x, iNode.y - jNode.y, iNode.z - jNode.z);
}

function wallArea(
  nodeNumbers: number[],
  nodeByNumber: Map<number, { x: number; y: number; z: number }>,
): number | undefined {
  const points = nodeNumbers.map(number => nodeByNumber.get(number));
  if (points.some(point => !point)) return undefined;
  const [a, b, c, d] = points as Array<{ x: number; y: number; z: number }>;
  const triangleArea = (
    p0: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
  ): number => {
    const ux = p1.x - p0.x;
    const uy = p1.y - p0.y;
    const uz = p1.z - p0.z;
    const vx = p2.x - p0.x;
    const vy = p2.y - p0.y;
    const vz = p2.z - p0.z;
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  };
  return triangleArea(a, b, c) + triangleArea(b, d, c);
}

export class FrameValidator {
  readonly options: Required<FrameValidatorOptions>;

  constructor(options: FrameValidatorOptions = {}) {
    this.options = {
      zeroLengthTolerance: options.zeroLengthTolerance ?? 1e-9,
      isolatedNodeSeverity: options.isolatedNodeSeverity ?? 'warning',
    };
  }

  validate(document: FrameDocument): FrameValidationResult {
    const diagnostics: FrameValidationDiagnostic[] = [];
    const sink: DiagnosticSink = {
      add: (severity, code, message, itemEntity, related) => diagnostics.push({
        severity,
        code,
        message,
        entity: itemEntity,
        ...(related && related.length > 0 ? { related } : {}),
      }),
    };

    validateNumbers(document.nodes, 'node', sink);
    validateNumbers(document.members, 'member', sink);
    validateNumbers(document.sections, 'section', sink);
    validateNumbers(document.materials, 'material', sink);
    validateNumbers(document.springs, 'spring', sink);
    validateNumbers(document.walls, 'wall', sink);

    const nodeByNumber = new Map(document.nodes.map(node => [node.number, node] as const));
    const sectionByNumber = new Map(document.sections.map(section => [section.number, section] as const));
    const materialNumbers = new Set(document.materials.map(material => material.number));
    const springNumbers = new Set(document.springs.map(spring => spring.number));
    const referencedNodes = new Set<number>();
    const usedSectionNumbers = new Set<number>();
    const usedMaterialNumbers = new Set<number>();

    document.nodes.forEach((node, index) => {
      const nodeEntity = entity('node', node.number, index);
      for (const field of [
        'x', 'y', 'z', 'temperature', 'longWeight', 'forceWeight', 'addForceWeight', 'area',
      ] as const) checkFinite(node[field], field, nodeEntity, sink);
      if (node.loads.length !== document.loadCaseCount) {
        sink.add(
          'error',
          'load_case_array_mismatch',
          `Node ${node.number} has ${node.loads.length} load rows; expected ${document.loadCaseCount}.`,
          { ...nodeEntity, field: 'loads' },
        );
      }
      node.loads.forEach((load, loadIndex) => {
        for (const field of ['p1', 'p2', 'p3', 'm1', 'm2', 'm3'] as const) {
          checkFinite(load[field], `loads[${loadIndex}].${field}`, nodeEntity, sink);
        }
      });
    });

    const memberKeyMap = new Map<string, Member>();
    document.members.forEach((member, index) => {
      const memberEntity = entity('member', member.number, index);
      for (const [field, nodeNumber] of [
        ['iNodeNumber', member.iNodeNumber],
        ['jNodeNumber', member.jNodeNumber],
      ] as const) {
        referencedNodes.add(nodeNumber);
        if (!nodeByNumber.has(nodeNumber)) {
          sink.add('error', 'missing_node_reference', `Member ${member.number} references missing node ${nodeNumber}.`, { ...memberEntity, field });
        }
      }
      if (member.iNodeNumber === member.jNodeNumber) {
        sink.add('error', 'same_endpoint_member', `Member ${member.number} uses node ${member.iNodeNumber} at both ends.`, memberEntity);
      }
      const length = memberLength(member, nodeByNumber);
      const section = sectionByNumber.get(member.sectionNumber);
      if (length !== undefined && length <= this.options.zeroLengthTolerance) {
        const severity: FrameValidationSeverity = section?.type === SectionType.Other ? 'warning' : 'error';
        sink.add(severity, 'zero_length_member', `Member ${member.number} has zero length.`, memberEntity);
      }
      usedSectionNumbers.add(member.sectionNumber);
      if (!section) {
        sink.add('error', 'missing_section_reference', `Member ${member.number} references missing section ${member.sectionNumber}.`, { ...memberEntity, field: 'sectionNumber' });
      }
      const springFields = [
        'ixSpring', 'iySpring', 'izSpring', 'jxSpring', 'jySpring', 'jzSpring',
      ] as const;
      for (const field of springFields) {
        const springNumber = member[field];
        if (springNumber < 0 || !Number.isInteger(springNumber)) {
          sink.add('error', 'invalid_spring_reference', `${field} must be 0, reserved spring 1/2, or a custom spring number >=3.`, { ...memberEntity, field });
        } else if (springNumber > 2 && !springNumbers.has(springNumber)) {
          sink.add('error', 'missing_spring_reference', `Member ${member.number} references missing spring ${springNumber}.`, { ...memberEntity, field });
        }
      }
      for (const field of ['p1', 'p2', 'p3'] as const) checkFinite(member[field], field, memberEntity, sink);
      if (member.memberLoads.length !== document.loadCaseCount || member.cmqLoads.length !== document.loadCaseCount) {
        sink.add(
          'error',
          'load_case_array_mismatch',
          `Member ${member.number} load arrays must both have ${document.loadCaseCount} rows.`,
          { ...memberEntity, field: 'memberLoads' },
        );
      }
      member.memberLoads.forEach((load, loadIndex) => {
        for (const field of ['scale', 'unitLoad', 'p1', 'p2', 'p3'] as const) {
          checkFinite(load[field], `memberLoads[${loadIndex}].${field}`, memberEntity, sink);
        }
      });
      member.cmqLoads.forEach((load, loadIndex) => {
        for (const field of ['moy', 'moz', 'iMy', 'iMz', 'iQx', 'iQy', 'iQz', 'jMy', 'jMz', 'jQx', 'jQy', 'jQz'] as const) {
          checkFinite(load[field], `cmqLoads[${loadIndex}].${field}`, memberEntity, sink);
        }
      });
      const endpointKey = member.iNodeNumber < member.jNodeNumber
        ? `${member.iNodeNumber}:${member.jNodeNumber}`
        : `${member.jNodeNumber}:${member.iNodeNumber}`;
      const duplicate = memberKeyMap.get(endpointKey);
      if (duplicate) {
        sink.add(
          'warning',
          'duplicate_member',
          `Members ${duplicate.number} and ${member.number} connect the same node pair.`,
          memberEntity,
          [entity('member', duplicate.number)],
        );
      } else memberKeyMap.set(endpointKey, member);
    });

    document.sections.forEach((section, index) => {
      const sectionEntity = entity('section', section.number, index);
      const validTypes = new Set<number>(Object.values(SectionType).filter(value => typeof value === 'number') as number[]);
      const validShapes = new Set<number>(Object.values(SectionShape).filter(value => typeof value === 'number') as number[]);
      if (!validTypes.has(section.type)) sink.add('error', 'invalid_section_type', `Section ${section.number} has invalid type ${section.type}.`, { ...sectionEntity, field: 'type' });
      if (!validShapes.has(section.shape)) sink.add('error', 'invalid_section_shape', `Section ${section.number} has invalid shape ${section.shape}.`, { ...sectionEntity, field: 'shape' });
      for (const field of ['p1_A', 'p2_Ix', 'torsionConstant', 'p3_Iy', 'p4_Iz', 'ky', 'kz'] as const) {
        checkFinite(section[field], field, sectionEntity, sink);
        if (section[field] < 0) sink.add('error', 'negative_section_property', `Section ${section.number} ${field} cannot be negative.`, { ...sectionEntity, field });
      }
      if (usedSectionNumbers.has(section.number) && section.type !== SectionType.Other && section.p1_A <= 0) {
        sink.add('error', 'missing_section_area', `Used section ${section.number} must have a positive area.`, { ...sectionEntity, field: 'p1_A' });
      }
      if (section.materialNumber === 0 && section.type === SectionType.Other) {
        sink.add('info', 'display_section_without_material', `Display-only section ${section.number} has no material.`, sectionEntity);
      } else if (!materialNumbers.has(section.materialNumber)) {
        sink.add('error', 'missing_material_reference', `Section ${section.number} references missing material ${section.materialNumber}.`, { ...sectionEntity, field: 'materialNumber' });
      } else usedMaterialNumbers.add(section.materialNumber);
    });

    document.materials.forEach((material, index) => {
      const materialEntity = entity('material', material.number, index);
      for (const field of ['young', 'shear', 'expansion', 'poisson', 'unitLoad'] as const) {
        checkFinite(material[field], field, materialEntity, sink);
      }
      if (material.young < 0 || material.shear < 0 || material.unitLoad < 0) {
        sink.add('error', 'negative_material_property', `Material ${material.number} has a negative physical property.`, materialEntity);
      }
      if (usedMaterialNumbers.has(material.number) && material.young <= 0) {
        sink.add('warning', 'missing_young_modulus', `Used material ${material.number} has no positive Young modulus.`, { ...materialEntity, field: 'young' });
      }
      if (material.poisson <= -1 || material.poisson >= 0.5) {
        sink.add('warning', 'unusual_poisson_ratio', `Material ${material.number} Poisson ratio is outside (-1, 0.5).`, { ...materialEntity, field: 'poisson' });
      }
    });

    document.springs.forEach((spring, index) => {
      const springEntity = entity('spring', spring.number, index);
      if (Spring.isReservedNumber(spring.number)) {
        sink.add('error', 'reserved_spring_collision', `Custom spring ${spring.number} collides with a reserved spring.`, springEntity);
      }
      checkFinite(spring.kTheta, 'kTheta', springEntity, sink);
      if (spring.kTheta < 0) sink.add('error', 'negative_spring_stiffness', `Spring ${spring.number} stiffness cannot be negative.`, { ...springEntity, field: 'kTheta' });
    });

    const boundariesByNode = new Map<number, number[]>();
    document.boundaries.forEach((boundary, index) => {
      const boundaryEntity = entity('boundary', boundary.nodeNumber, index);
      referencedNodes.add(boundary.nodeNumber);
      if (!nodeByNumber.has(boundary.nodeNumber)) {
        sink.add('error', 'missing_boundary_node', `Boundary references missing node ${boundary.nodeNumber}.`, boundaryEntity);
      }
      const indexes = boundariesByNode.get(boundary.nodeNumber) ?? [];
      indexes.push(index);
      boundariesByNode.set(boundary.nodeNumber, indexes);
      for (const field of ['deltaX', 'deltaY', 'deltaZ', 'thetaX', 'thetaY', 'thetaZ'] as const) {
        if (boundary[field] !== 0 && boundary[field] !== 1) {
          sink.add('error', 'invalid_boundary_dof', `Boundary DOF ${field} must be 0 or 1.`, { ...boundaryEntity, field });
        }
      }
      const node = nodeByNumber.get(boundary.nodeNumber);
      if (node && node.boundaryCondition !== boundary) {
        sink.add('warning', 'boundary_reference_mismatch', `Node ${boundary.nodeNumber} boundaryCondition is not synchronized.`, boundaryEntity);
      }
    });
    for (const [nodeNumber, indexes] of boundariesByNode) {
      if (indexes.length > 1) {
        sink.add('error', 'duplicate_boundary', `Node ${nodeNumber} has ${indexes.length} boundary definitions.`, entity('boundary', nodeNumber, indexes[0]));
      }
    }
    document.nodes.forEach((node, index) => {
      if (node.boundaryCondition && !document.boundaries.includes(node.boundaryCondition)) {
        sink.add('warning', 'orphan_node_boundary', `Node ${node.number} points to a boundary outside document.boundaries.`, entity('node', node.number, index, 'boundaryCondition'));
      }
    });

    document.walls.forEach((wall, index) => {
      const wallEntity = entity('wall', wall.number, index);
      const nodeNumbers = [wall.leftBottomNode, wall.rightBottomNode, wall.leftTopNode, wall.rightTopNode];
      nodeNumbers.forEach((nodeNumber, cornerIndex) => {
        referencedNodes.add(nodeNumber);
        if (!nodeByNumber.has(nodeNumber)) {
          sink.add('error', 'missing_wall_node', `Wall ${wall.number} references missing node ${nodeNumber}.`, { ...wallEntity, field: `node[${cornerIndex}]` });
        }
      });
      if (new Set(nodeNumbers).size < 4) {
        sink.add('error', 'degenerate_wall', `Wall ${wall.number} must reference four distinct nodes.`, wallEntity);
      } else {
        const area = wallArea(nodeNumbers, nodeByNumber);
        if (area !== undefined && area <= this.options.zeroLengthTolerance ** 2) {
          sink.add('error', 'zero_area_wall', `Wall ${wall.number} has zero area.`, wallEntity);
        }
      }
      if (wall.materialNumber !== 0 && !materialNumbers.has(wall.materialNumber)) {
        sink.add('error', 'missing_material_reference', `Wall ${wall.number} references missing material ${wall.materialNumber}.`, { ...wallEntity, field: 'materialNumber' });
      }
      if (wall.materialNumber !== 0) usedMaterialNumbers.add(wall.materialNumber);
      for (const field of ['p1', 'p2', 'p3', 'p4'] as const) checkFinite(wall[field], field, wallEntity, sink);
    });

    document.nodes.forEach((node, index) => {
      if (!referencedNodes.has(node.number)) {
        sink.add(this.options.isolatedNodeSeverity, 'isolated_node', `Node ${node.number} is not referenced by a member, wall, or boundary.`, entity('node', node.number, index));
      }
    });

    if (!Number.isInteger(document.loadCaseCount) || document.loadCaseCount < 1) {
      sink.add('error', 'invalid_load_case_count', 'loadCaseCount must be an integer of at least 1.', entity('document', undefined, undefined, 'loadCaseCount'));
    }
    if (document.loadCases.length !== document.loadCaseCount) {
      sink.add('error', 'load_case_metadata_mismatch', `loadCases has ${document.loadCases.length} entries; expected ${document.loadCaseCount}.`, entity('document', undefined, undefined, 'loadCases'));
    }
    const loadCaseIds = new Set<string>();
    document.loadCases.forEach((loadCase, index) => {
      const loadCaseEntity: FrameValidationEntity = { kind: 'loadCase', id: loadCase.id, index };
      if (!loadCase.id.trim()) sink.add('error', 'empty_load_case_id', `Load case ${index + 1} has an empty id.`, loadCaseEntity);
      else if (loadCaseIds.has(loadCase.id)) sink.add('error', 'duplicate_load_case_id', `Load case id "${loadCase.id}" is duplicated.`, loadCaseEntity);
      loadCaseIds.add(loadCase.id);
    });
    const combinationIds = new Set<string>();
    document.loadCombinations.forEach((combination, index) => {
      const combinationEntity: FrameValidationEntity = { kind: 'loadCombination', id: combination.id, index };
      if (!combination.id.trim() || combinationIds.has(combination.id)) {
        sink.add('error', 'invalid_load_combination_id', `Load combination id "${combination.id}" is empty or duplicated.`, combinationEntity);
      }
      combinationIds.add(combination.id);
      combination.terms.forEach((term, termIndex) => {
        if (!loadCaseIds.has(term.loadCaseId)) {
          sink.add('error', 'missing_load_case_reference', `Combination ${combination.id} references unknown load case "${term.loadCaseId}".`, { ...combinationEntity, field: `terms[${termIndex}]` });
        }
        if (!Number.isFinite(term.factor)) {
          sink.add('error', 'non_finite_combination_factor', `Combination ${combination.id} has a non-finite factor.`, { ...combinationEntity, field: `terms[${termIndex}].factor` });
        }
      });
    });

    for (const section of document.sections) {
      if (!usedSectionNumbers.has(section.number)) sink.add('info', 'unused_section', `Section ${section.number} is not used.`, entity('section', section.number));
    }
    for (const material of document.materials) {
      if (!usedMaterialNumbers.has(material.number)) sink.add('info', 'unused_material', `Material ${material.number} is not used.`, entity('material', material.number));
    }

    const errorCount = diagnostics.filter(diagnostic => diagnostic.severity === 'error').length;
    const warningCount = diagnostics.filter(diagnostic => diagnostic.severity === 'warning').length;
    const infoCount = diagnostics.length - errorCount - warningCount;
    return { diagnostics, errorCount, warningCount, infoCount, isValid: errorCount === 0 };
  }
}

export function validateFrameDocument(
  document: FrameDocument,
  options: FrameValidatorOptions = {},
): FrameValidationResult {
  return new FrameValidator(options).validate(document);
}
