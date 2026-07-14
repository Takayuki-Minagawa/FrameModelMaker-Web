import { FrameDocument } from '../models/FrameDocument';

export type UnitLoadInterpretation = 'ignore' | 'weightPerVolume' | 'massPerVolume';

export interface ModelStatisticsOptions {
  zeroLengthTolerance?: number;
  /** Material.unitLoadの単位は利用側が決定する。既定では数量計算に使用しない。 */
  unitLoadInterpretation?: UnitLoadInterpretation;
}

export interface SectionQuantity {
  sectionNumber: number;
  memberCount: number;
  totalLength: number;
  volume: number;
}

export interface MaterialQuantity {
  materialNumber: number;
  memberCount: number;
  totalLength: number;
  volume: number;
  estimatedWeight?: number;
  estimatedMass?: number;
}

export interface ModelStatistics {
  counts: {
    nodes: number;
    members: number;
    sections: number;
    materials: number;
    boundaries: number;
    springs: number;
    walls: number;
    loadCases: number;
    loadCombinations: number;
  };
  bounds: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
  } | null;
  totalMemberLength: number;
  totalMemberVolume: number;
  sectionQuantities: SectionQuantity[];
  materialQuantities: MaterialQuantity[];
  isolatedNodeNumbers: number[];
  zeroLengthMemberNumbers: number[];
  unresolvedMemberNumbers: number[];
  unitLoadInterpretation: UnitLoadInterpretation;
}

export function calculateModelStatistics(
  document: FrameDocument,
  options: ModelStatisticsOptions = {},
): ModelStatistics {
  const tolerance = options.zeroLengthTolerance ?? 1e-9;
  const unitLoadInterpretation = options.unitLoadInterpretation ?? 'ignore';
  const nodes = new Map(document.nodes.map(node => [node.number, node] as const));
  const sections = new Map(document.sections.map(section => [section.number, section] as const));
  const materials = new Map(document.materials.map(material => [material.number, material] as const));
  const referencedNodes = new Set<number>();
  const zeroLengthMemberNumbers: number[] = [];
  const unresolvedMemberNumbers: number[] = [];
  const sectionMap = new Map<number, SectionQuantity>();
  const materialMap = new Map<number, MaterialQuantity>();
  let totalMemberLength = 0;
  let totalMemberVolume = 0;

  for (const member of document.members) {
    referencedNodes.add(member.iNodeNumber);
    referencedNodes.add(member.jNodeNumber);
    const iNode = nodes.get(member.iNodeNumber);
    const jNode = nodes.get(member.jNodeNumber);
    if (!iNode || !jNode) {
      unresolvedMemberNumbers.push(member.number);
      continue;
    }
    const length = Math.hypot(iNode.x - jNode.x, iNode.y - jNode.y, iNode.z - jNode.z);
    if (length <= tolerance) zeroLengthMemberNumbers.push(member.number);
    totalMemberLength += length;
    const section = sections.get(member.sectionNumber);
    const volume = section ? section.p1_A * length : 0;
    totalMemberVolume += volume;
    const sectionQuantity = sectionMap.get(member.sectionNumber) ?? {
      sectionNumber: member.sectionNumber,
      memberCount: 0,
      totalLength: 0,
      volume: 0,
    };
    sectionQuantity.memberCount++;
    sectionQuantity.totalLength += length;
    sectionQuantity.volume += volume;
    sectionMap.set(member.sectionNumber, sectionQuantity);

    if (section) {
      const materialQuantity = materialMap.get(section.materialNumber) ?? {
        materialNumber: section.materialNumber,
        memberCount: 0,
        totalLength: 0,
        volume: 0,
      };
      materialQuantity.memberCount++;
      materialQuantity.totalLength += length;
      materialQuantity.volume += volume;
      materialMap.set(section.materialNumber, materialQuantity);
    }
  }
  for (const wall of document.walls) {
    referencedNodes.add(wall.leftBottomNode);
    referencedNodes.add(wall.rightBottomNode);
    referencedNodes.add(wall.leftTopNode);
    referencedNodes.add(wall.rightTopNode);
  }
  for (const boundary of document.boundaries) referencedNodes.add(boundary.nodeNumber);

  for (const quantity of materialMap.values()) {
    const unitLoad = materials.get(quantity.materialNumber)?.unitLoad;
    if (unitLoadInterpretation === 'weightPerVolume' && unitLoad !== undefined) {
      quantity.estimatedWeight = quantity.volume * unitLoad;
    } else if (unitLoadInterpretation === 'massPerVolume' && unitLoad !== undefined) {
      quantity.estimatedMass = quantity.volume * unitLoad;
    }
  }

  let bounds: ModelStatistics['bounds'] = null;
  if (document.nodes.length > 0) {
    const xs = document.nodes.map(node => node.x);
    const ys = document.nodes.map(node => node.y);
    const zs = document.nodes.map(node => node.z);
    const min = { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) };
    const max = { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) };
    bounds = { min, max, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } };
  }

  return {
    counts: {
      nodes: document.nodes.length,
      members: document.members.length,
      sections: document.sections.length,
      materials: document.materials.length,
      boundaries: document.boundaries.length,
      springs: document.springs.length,
      walls: document.walls.length,
      loadCases: Math.max(1, document.loadCaseCount),
      loadCombinations: document.loadCombinations.length,
    },
    bounds,
    totalMemberLength,
    totalMemberVolume,
    sectionQuantities: [...sectionMap.values()].sort((a, b) => a.sectionNumber - b.sectionNumber),
    materialQuantities: [...materialMap.values()].sort((a, b) => a.materialNumber - b.materialNumber),
    isolatedNodeNumbers: document.nodes.filter(node => !referencedNodes.has(node.number)).map(node => node.number),
    zeroLengthMemberNumbers,
    unresolvedMemberNumbers,
    unitLoadInterpretation,
  };
}
