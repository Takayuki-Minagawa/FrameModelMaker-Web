import { parse as parseYaml } from 'yaml';
import { BoundaryCondition } from '../models/BoundaryCondition';
import { FrameDocument } from '../models/FrameDocument';
import { Material } from '../models/Material';
import { Member } from '../models/Member';
import { Node } from '../models/Node';
import { Section, SectionShape, SectionType } from '../models/Section';

type RawObject = Record<string, unknown>;

export type FrameYamlDiagnosticLevel = 'info' | 'warn' | 'error';

export interface FrameYamlImportDiagnostic {
  level: FrameYamlDiagnosticLevel;
  code: string;
  message: string;
  tag?: number;
}

export interface FrameYamlImportResult {
  diagnostics: FrameYamlImportDiagnostic[];
  importedNodeCount: number;
  importedMemberCount: number;
  skippedElementCount: number;
}

interface NumberedSection {
  key: string;
  section: Section;
}

const ZERO_LENGTH_EPSILON_CM = 1e-9;
const SHORT_LINK_WARNING_CM = 0.1;
const GENERATED_TRUSS_SECTION_KEY_PREFIX = '__generated_truss__';
const GENERATED_LINK_SECTION_KEY = '__generated_two_node_link__';

function asObject(value: unknown): RawObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as RawObject;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value: unknown, fallback = 0): number {
  const n = Math.trunc(toNumber(value, fallback));
  return n > 0 ? n : fallback;
}

function toString_(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function makeDiagnostic(
  level: FrameYamlDiagnosticLevel,
  code: string,
  message: string,
  tag?: number,
): FrameYamlImportDiagnostic {
  return tag == null ? { level, code, message } : { level, code, message, tag };
}

function requireUnitFactor(units: RawObject, key: string, expected: string, factor: number): number {
  const unit = toString_(units[key]);
  if (!unit) {
    throw new Error(`Invalid analysis YAML: units.${key} is required`);
  }
  if (unit !== expected) {
    throw new Error(`Invalid analysis YAML: units.${key} must be "${expected}" (got "${unit}")`);
  }
  return factor;
}

function collectDuplicateTags(items: unknown[], key: string): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const item of items) {
    const tag = toPositiveInt(asObject(item)[key]);
    if (tag === 0) continue;
    if (seen.has(tag)) duplicates.add(tag);
    seen.add(tag);
  }
  return [...duplicates].sort((a, b) => a - b);
}

function createMaterialNumber(preferred: number, nextNumber: number, used: Set<number>): number {
  if (preferred > 0 && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  let n = nextNumber;
  while (used.has(n)) n++;
  used.add(n);
  return n;
}

function buildMaterials(
  rawMaterials: RawObject,
  stressFactor: number,
): { materials: Material[]; materialNumberByRef: Map<string, number> } {
  const materials: Material[] = [];
  const materialNumberByRef = new Map<string, number>();
  const usedNumbers = new Set<number>();
  let nextNumber = 1;

  for (const [key, rawValue] of Object.entries(rawMaterials)) {
    const raw = asObject(rawValue);
    const material = new Material();
    material.number = createMaterialNumber(toPositiveInt(raw.tag), nextNumber, usedNumbers);
    material.young = toNumber(raw.elastic_modulus) * stressFactor;
    material.shear = toNumber(raw.shear_modulus) * stressFactor;
    material.poisson = toNumber(raw.poisson);
    material.name = key;
    materials.push(material);
    materialNumberByRef.set(key, material.number);
    nextNumber = Math.max(nextNumber, material.number + 1);
  }

  return { materials, materialNumberByRef };
}

function inferSectionMaterialRefs(elements: unknown[], diagnostics: FrameYamlImportDiagnostic[]): Map<string, string> {
  const refs = new Map<string, string>();
  for (const value of elements) {
    const raw = asObject(value);
    const sectionRef = toString_(raw.section_ref);
    const materialRef = toString_(raw.material_ref);
    if (!sectionRef || !materialRef) continue;

    const existing = refs.get(sectionRef);
    if (!existing) {
      refs.set(sectionRef, materialRef);
    } else if (existing !== materialRef) {
      diagnostics.push(makeDiagnostic(
        'warn',
        'section_material_ref_conflict',
        `Section "${sectionRef}" is referenced with both "${existing}" and "${materialRef}" materials; "${existing}" is used for the imported section.`,
        toPositiveInt(raw.tag) || undefined,
      ));
    }
  }
  return refs;
}

function buildSections(
  rawSections: RawObject,
  materialNumberByRef: Map<string, number>,
  sectionMaterialRefs: Map<string, string>,
  areaFactor: number,
  secondMomentFactor: number,
): { sections: Section[]; sectionNumberByRef: Map<string, number>; nextSectionNumber: number } {
  const numbered: NumberedSection[] = [];
  let sectionNumber = 1;

  for (const [key, rawValue] of Object.entries(rawSections)) {
    const raw = asObject(rawValue);
    const section = new Section();
    section.number = sectionNumber++;
    section.materialNumber = materialNumberByRef.get(sectionMaterialRefs.get(key) ?? '') ?? 0;
    section.type = SectionType.Horizontal;
    section.shape = SectionShape.DirectInput;
    const area = toNumber(raw.area);
    section.p1_A = area * areaFactor;
    section.p2_Ix = toNumber(raw.torsion_constant) * secondMomentFactor;
    section.p3_Iy = toNumber(raw.inertia_y) * secondMomentFactor;
    section.p4_Iz = toNumber(raw.inertia_z) * secondMomentFactor;
    section.ky = area === 0 ? 0 : toNumber(raw.shear_area_y) / area;
    section.kz = area === 0 ? 0 : toNumber(raw.shear_area_z) / area;
    section.comment = key;
    numbered.push({ key, section });
  }

  return {
    sections: numbered.map(item => item.section),
    sectionNumberByRef: new Map(numbered.map(item => [item.key, item.section.number] as const)),
    nextSectionNumber: sectionNumber,
  };
}

function ensureGeneratedTrussSection(
  materialRef: string,
  sections: Section[],
  sectionNumberByRef: Map<string, number>,
  materialNumberByRef: Map<string, number>,
  nextSectionNumber: { value: number },
): number {
  const key = `${GENERATED_TRUSS_SECTION_KEY_PREFIX}${materialRef || 'unknown'}`;
  const existing = sectionNumberByRef.get(key);
  if (existing) return existing;

  const section = new Section();
  section.number = nextSectionNumber.value++;
  section.materialNumber = materialNumberByRef.get(materialRef) ?? 0;
  section.type = SectionType.Truss;
  section.shape = SectionShape.DirectInput;
  section.comment = `Generated truss section (${materialRef || 'unknown material'})`;
  sections.push(section);
  sectionNumberByRef.set(key, section.number);
  return section.number;
}

function ensureGeneratedLinkSection(
  sections: Section[],
  sectionNumberByRef: Map<string, number>,
  nextSectionNumber: { value: number },
): number {
  const existing = sectionNumberByRef.get(GENERATED_LINK_SECTION_KEY);
  if (existing) return existing;

  const section = new Section();
  section.number = nextSectionNumber.value++;
  section.type = SectionType.Other;
  section.shape = SectionShape.DirectInput;
  section.comment = 'Generated display section for twoNodeLink3D';
  sections.push(section);
  sectionNumberByRef.set(GENERATED_LINK_SECTION_KEY, section.number);
  return section.number;
}

function parseNodes(
  rawNodes: unknown[],
  lengthFactor: number,
  diagnostics: FrameYamlImportDiagnostic[],
): { nodes: Node[]; nodeMap: Map<number, Node>; fatal: boolean } {
  const nodes: Node[] = [];
  const nodeMap = new Map<number, Node>();
  let fatal = false;

  for (const value of rawNodes) {
    const raw = asObject(value);
    const tag = toPositiveInt(raw.tag);
    const x = toNumber(raw.x, NaN);
    const y = toNumber(raw.y, NaN);
    const z = toNumber(raw.z, NaN);

    if (tag === 0 || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      diagnostics.push(makeDiagnostic('error', 'invalid_node', `Invalid node entry: ${JSON.stringify(raw)}`, tag || undefined));
      fatal = true;
      continue;
    }

    const node = new Node(x * lengthFactor, y * lengthFactor, z * lengthFactor);
    node.number = tag;
    nodes.push(node);
    nodeMap.set(tag, node);
  }

  return { nodes, nodeMap, fatal };
}

function parseSupports(rawSupports: unknown[], nodeMap: Map<number, Node>, diagnostics: FrameYamlImportDiagnostic[]): BoundaryCondition[] {
  const boundaries: BoundaryCondition[] = [];

  for (const value of rawSupports) {
    const raw = asObject(value);
    const nodeTag = toPositiveInt(raw.node_tag);
    if (!nodeMap.has(nodeTag)) {
      diagnostics.push(makeDiagnostic('warn', 'missing_support_node', `Support references missing node ${nodeTag}.`, nodeTag || undefined));
      continue;
    }

    const dofs = new Set(asArray(raw.dofs).map(toString_));
    const boundary = new BoundaryCondition();
    boundary.nodeNumber = nodeTag;
    boundary.deltaX = dofs.has('ux') ? 1 : 0;
    boundary.deltaY = dofs.has('uy') ? 1 : 0;
    boundary.deltaZ = dofs.has('uz') ? 1 : 0;
    boundary.thetaX = dofs.has('rx') ? 1 : 0;
    boundary.thetaY = dofs.has('ry') ? 1 : 0;
    boundary.thetaZ = dofs.has('rz') ? 1 : 0;
    boundaries.push(boundary);
  }

  return boundaries;
}

function nodeDistanceCm(iNode: Node, jNode: Node): number {
  const dx = iNode.x - jNode.x;
  const dy = iNode.y - jNode.y;
  const dz = iNode.z - jNode.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function parseElements(
  rawElements: unknown[],
  nodeMap: Map<number, Node>,
  sections: Section[],
  sectionNumberByRef: Map<string, number>,
  materialNumberByRef: Map<string, number>,
  nextSectionNumber: { value: number },
  diagnostics: FrameYamlImportDiagnostic[],
): { members: Member[]; skippedElementCount: number } {
  const members: Member[] = [];
  let skippedElementCount = 0;

  for (const value of rawElements) {
    const raw = asObject(value);
    const type = toString_(raw.type);
    const tag = toPositiveInt(raw.tag);
    const nodeI = toPositiveInt(raw.node_i);
    const nodeJ = toPositiveInt(raw.node_j);
    const iNode = nodeMap.get(nodeI);
    const jNode = nodeMap.get(nodeJ);

    if (!tag) {
      diagnostics.push(makeDiagnostic('error', 'invalid_element_tag', `Element has an invalid tag: ${JSON.stringify(raw)}`));
      skippedElementCount++;
      continue;
    }

    if (!iNode || !jNode) {
      diagnostics.push(makeDiagnostic(
        'error',
        'missing_element_node',
        `Element ${tag} references missing endpoint node(s): ${nodeI}, ${nodeJ}.`,
        tag,
      ));
      skippedElementCount++;
      continue;
    }

    const length = nodeDistanceCm(iNode, jNode);
    let sectionNumber = 0;

    if (type === 'elasticTimoshenkoBeam3D' || type === 'truss3D') {
      if (length <= ZERO_LENGTH_EPSILON_CM) {
        diagnostics.push(makeDiagnostic('error', 'zero_length_frame_element', `Element ${tag} (${type}) has zero length and was skipped.`, tag));
        skippedElementCount++;
        continue;
      }

      const sectionRef = toString_(raw.section_ref);
      if (sectionRef) {
        sectionNumber = sectionNumberByRef.get(sectionRef) ?? 0;
      }
      if (!sectionNumber && type === 'truss3D') {
        sectionNumber = ensureGeneratedTrussSection(
          toString_(raw.material_ref),
          sections,
          sectionNumberByRef,
          materialNumberByRef,
          nextSectionNumber,
        );
      }
      if (!sectionNumber) {
        diagnostics.push(makeDiagnostic('warn', 'missing_section_ref', `Element ${tag} has no matching section_ref.`, tag));
      }
    } else if (type === 'twoNodeLink3D') {
      sectionNumber = ensureGeneratedLinkSection(sections, sectionNumberByRef, nextSectionNumber);
      if (length <= ZERO_LENGTH_EPSILON_CM) {
        diagnostics.push(makeDiagnostic('warn', 'zero_length_link_element', `twoNodeLink3D element ${tag} is zero length and was kept for display.`, tag));
      } else if (length <= SHORT_LINK_WARNING_CM) {
        diagnostics.push(makeDiagnostic('warn', 'short_link_element', `twoNodeLink3D element ${tag} is very short (${length.toFixed(6)} cm).`, tag));
      }
      diagnostics.push(makeDiagnostic('warn', 'link_metadata_not_preserved', `twoNodeLink3D element ${tag} is imported as a display member; stiffness/orientation metadata is not saved in JSON.`, tag));
    } else {
      diagnostics.push(makeDiagnostic('warn', 'unsupported_element_type', `Element ${tag} has unsupported type "${type}" and was skipped.`, tag));
      skippedElementCount++;
      continue;
    }

    const member = new Member();
    member.number = tag;
    member.iNodeNumber = nodeI;
    member.jNodeNumber = nodeJ;
    member.sectionNumber = sectionNumber;
    members.push(member);
  }

  return { members, skippedElementCount };
}

function assignLoadCaseDefaults(nodes: Node[], members: Member[]): void {
  for (const node of nodes) node.setLoadCaseCount(1);
  for (const member of members) member.setLoadCaseCount(1);
}

function appendImportMemo(doc: FrameDocument, result: FrameYamlImportResult): void {
  const warnCount = result.diagnostics.filter(d => d.level === 'warn').length;
  const errorCount = result.diagnostics.filter(d => d.level === 'error').length;
  doc.calcCaseMemo = [
    'ANALYSIS-YAML-IMPORT',
    `nodes=${result.importedNodeCount}`,
    `members=${result.importedMemberCount}`,
    `skippedElements=${result.skippedElementCount}`,
    `warnings=${warnCount}`,
    `errors=${errorCount}`,
    'unsupported=constraints,nodal_masses,groups,result_extraction,traceability,link_metadata',
  ];
}

export function parseFrameAnalysisYaml(text: string, doc: FrameDocument): FrameYamlImportResult {
  const diagnostics: FrameYamlImportDiagnostic[] = [];
  let parsed: unknown;

  try {
    parsed = parseYaml(text);
  } catch (e) {
    throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
  }

  const root = asObject(parsed);
  const model = asObject(root.model);
  if (Object.keys(root).length === 0 || Object.keys(model).length === 0) {
    throw new Error('Invalid analysis YAML: root.model must be an object');
  }

  const schemaVersion = toString_(root.schema_version);
  if (schemaVersion !== '1') {
    throw new Error(`Invalid analysis YAML: schema_version must be "1" (got "${schemaVersion || 'missing'}")`);
  }
  if (!root.units || typeof root.units !== 'object' || Array.isArray(root.units)) {
    throw new Error('Invalid analysis YAML: root.units must be an object');
  }
  if (!Array.isArray(model.nodes)) {
    throw new Error('Invalid analysis YAML: model.nodes must be an array');
  }
  if (!Array.isArray(model.elements)) {
    throw new Error('Invalid analysis YAML: model.elements must be an array');
  }

  diagnostics.push(makeDiagnostic('info', 'schema_version', `schema_version=${schemaVersion || 'unknown'}`));

  const units = asObject(root.units);
  const lengthFactor = requireUnitFactor(units, 'length', 'mm', 0.1);
  requireUnitFactor(units, 'force', 'N', 1);
  const stressFactor = requireUnitFactor(units, 'stress', 'N/mm^2', 0.1);
  const areaFactor = requireUnitFactor(units, 'area', 'mm^2', 0.01);
  const secondMomentFactor = requireUnitFactor(units, 'second_moment', 'mm^4', 0.0001);

  const rawNodes = asArray(model.nodes);
  const rawElements = asArray(model.elements);
  const rawSupports = asArray(model.supports);

  for (const duplicate of collectDuplicateTags(rawNodes, 'tag')) {
    diagnostics.push(makeDiagnostic('error', 'duplicate_node_tag', `Duplicate node tag ${duplicate}.`, duplicate));
  }
  for (const duplicate of collectDuplicateTags(rawElements, 'tag')) {
    diagnostics.push(makeDiagnostic('error', 'duplicate_element_tag', `Duplicate element tag ${duplicate}.`, duplicate));
  }
  if (diagnostics.some(d => d.code === 'duplicate_node_tag' || d.code === 'duplicate_element_tag')) {
    throw new Error(`Invalid analysis YAML: ${diagnostics.filter(d => d.level === 'error').map(d => d.message).join(' ')}`);
  }

  const { nodes, nodeMap, fatal } = parseNodes(rawNodes, lengthFactor, diagnostics);
  if (fatal) {
    throw new Error(`Invalid analysis YAML: ${diagnostics.filter(d => d.level === 'error').map(d => d.message).join(' ')}`);
  }

  const { materials, materialNumberByRef } = buildMaterials(asObject(model.materials), stressFactor);
  const sectionMaterialRefs = inferSectionMaterialRefs(rawElements, diagnostics);
  const sectionResult = buildSections(
    asObject(model.sections),
    materialNumberByRef,
    sectionMaterialRefs,
    areaFactor,
    secondMomentFactor,
  );
  const nextSectionNumber = { value: sectionResult.nextSectionNumber };
  const { members, skippedElementCount } = parseElements(
    rawElements,
    nodeMap,
    sectionResult.sections,
    sectionResult.sectionNumberByRef,
    materialNumberByRef,
    nextSectionNumber,
    diagnostics,
  );
  const boundaries = parseSupports(rawSupports, nodeMap, diagnostics);

  assignLoadCaseDefaults(nodes, members);

  const result: FrameYamlImportResult = {
    diagnostics,
    importedNodeCount: nodes.length,
    importedMemberCount: members.length,
    skippedElementCount,
  };

  doc.init();
  doc.title = toString_(model.name);
  doc.nodes = nodes;
  doc.materials = materials;
  doc.sections = sectionResult.sections;
  doc.members = members;
  doc.boundaries = boundaries;
  for (const boundary of doc.boundaries) {
    const node = nodeMap.get(boundary.nodeNumber);
    if (node) node.boundaryCondition = boundary;
  }
  appendImportMemo(doc, result);
  doc.notifyChange();

  diagnostics.push(makeDiagnostic(
    'info',
    'import_summary',
    `Imported ${nodes.length} nodes, ${members.length} members, ${materials.length} materials, ${sectionResult.sections.length} sections; skipped ${skippedElementCount} elements.`,
  ));

  return result;
}
