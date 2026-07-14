import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { BoundaryCondition } from '../models/BoundaryCondition';
import { FrameDocument } from '../models/FrameDocument';
import { Material } from '../models/Material';
import { Member } from '../models/Member';
import { Node } from '../models/Node';
import { Section, SectionShape, SectionType } from '../models/Section';
import {
  AnalysisGroupMetadata,
  AnalysisMetadata,
  EqualDOFConstraintMetadata,
  JsonValue,
  LinkElementMetadata,
  LocalAxisMetadata,
  NodalMassMetadata,
  SourceTraceabilityMetadata,
} from '../models/AnalysisMetadata';
import { LoadCase, LoadCaseType } from '../models/LoadCase';
import { LoadCombination, LoadCombinationTerm } from '../models/LoadCombination';

type RawObject = Record<string, unknown>;

export type FrameYamlDiagnosticLevel = 'info' | 'warn' | 'error';

export interface FrameYamlImportDiagnostic {
  level: FrameYamlDiagnosticLevel;
  code: string;
  message: string;
  tag?: number;
  sourcePath?: string;
  entityType?: string;
  details?: Record<string, string | number | boolean | null>;
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

export interface FrameYamlExportResult {
  yaml: string;
  diagnostics: FrameYamlImportDiagnostic[];
}

function asEntries(value: unknown): Array<{ key?: string; value: unknown }> {
  if (Array.isArray(value)) return value.map(item => ({ value: item }));
  if (value && typeof value === 'object') {
    return Object.entries(value as RawObject).map(([key, item]) => ({ key, value: item }));
  }
  return [];
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value as JsonValue;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) {
    return value.map(item => toJsonValue(item) ?? null);
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as RawObject)) {
      const converted = toJsonValue(item);
      if (converted !== undefined) result[key] = converted;
    }
    return result;
  }
  return String(value);
}

function toNumberArray(value: unknown): number[] {
  return asArray(value).map(item => toNumber(item, NaN)).filter(Number.isFinite);
}

/** Positional arrays represent DOFs/vector components, so invalid slots must not shift later values. */
function toPositionalNumberArray(value: unknown, fallback = 0): number[] {
  return asArray(value).map(item => toNumber(item, fallback));
}

function toStringArray(value: unknown): string[] {
  return asArray(value).map(toString_).filter(Boolean);
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
    section.torsionConstant = section.p2_Ix;
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

function parseLocalAxis(raw: RawObject): LocalAxisMetadata | undefined {
  const x = toPositionalNumberArray(raw.orient_x);
  const y = toPositionalNumberArray(raw.orient_y);
  const vecxz = toPositionalNumberArray(raw.vecxz);
  if (x.length === 0 && y.length === 0 && vecxz.length === 0) return undefined;
  return {
    ...(x.length > 0 ? { x } : {}),
    ...(y.length > 0 ? { y } : {}),
    ...(vecxz.length > 0 ? { vecxz } : {}),
  };
}

function parseEqualDOFConstraints(rawConstraints: unknown): EqualDOFConstraintMetadata[] {
  const constraints: EqualDOFConstraintMetadata[] = [];
  for (const { key, value } of asEntries(rawConstraints)) {
    const raw = asObject(value);
    const type = toString_(raw.type || raw.kind);
    if (type.toLowerCase() !== 'equaldof') continue;
    const retainedNode = toPositiveInt(
      raw.retained_node ?? raw.retained_node_tag ?? raw.master_node ?? raw.master_node_tag,
    );
    const constrainedNode = toPositiveInt(
      raw.constrained_node ?? raw.constrained_node_tag ?? raw.slave_node ?? raw.slave_node_tag,
    );
    constraints.push({
      type: 'equalDOF',
      retainedNode,
      constrainedNode,
      dofs: toStringArray(raw.dofs),
      ...(raw.tag != null || key ? { tag: toPositiveInt(raw.tag) || key } : {}),
      raw: (toJsonValue(raw) ?? {}) as Record<string, JsonValue>,
    });
  }
  return constraints;
}

function parseNodalMasses(rawMasses: unknown): NodalMassMetadata[] {
  return asEntries(rawMasses).map(({ key, value }) => {
    const raw = asObject(value);
    const direct = raw.values ?? raw.mass ?? raw.masses;
    let values = toPositionalNumberArray(direct);
    const componentFields = ['mx', 'my', 'mz', 'mrx', 'mry', 'mrz'] as const;
    if (values.length === 0 && componentFields.some(field => raw[field] !== undefined)) {
      values = componentFields.map(field => toNumber(raw[field], 0));
    }
    return {
      nodeTag: toPositiveInt(raw.node_tag ?? raw.node ?? key),
      values,
      raw: (toJsonValue(raw) ?? {}) as Record<string, JsonValue>,
    };
  });
}

function parseLinkMetadata(rawElements: unknown[]): LinkElementMetadata[] {
  const result: LinkElementMetadata[] = [];
  for (const value of rawElements) {
    const raw = asObject(value);
    if (toString_(raw.type) !== 'twoNodeLink3D') continue;
    const orientation = parseLocalAxis(raw);
    result.push({
      tag: toPositiveInt(raw.tag),
      nodeI: toPositiveInt(raw.node_i),
      nodeJ: toPositiveInt(raw.node_j),
      directions: toStringArray(raw.dir ?? raw.directions),
      stiffness: toPositionalNumberArray(raw.stiffness),
      ...(orientation ? { orientation } : {}),
      ...(asArray(raw.shear_dist).length > 0 ? { shearDistance: toNumberArray(raw.shear_dist) } : {}),
      raw: (toJsonValue(raw) ?? {}) as Record<string, JsonValue>,
    });
  }
  return result;
}

function parseGroups(rawGroups: unknown): AnalysisGroupMetadata[] {
  return asEntries(rawGroups).map(({ key, value }, index) => {
    const raw = asObject(value);
    return {
      name: toString_(raw.name) || key || `Group ${index + 1}`,
      nodeTags: toNumberArray(raw.node_tags ?? raw.nodes).map(Math.trunc),
      elementTags: toNumberArray(raw.element_tags ?? raw.elements).map(Math.trunc),
      raw: toJsonValue(value),
    };
  });
}

function parseTraceability(rawTraceability: unknown): SourceTraceabilityMetadata | undefined {
  if (!rawTraceability || typeof rawTraceability !== 'object') return undefined;
  const raw = asObject(rawTraceability);
  return {
    ...(raw.source != null ? { source: toString_(raw.source) } : {}),
    ...(raw.generated_by != null ? { generatedBy: toString_(raw.generated_by) } : {}),
    ...(raw.generated_at != null ? { generatedAt: toString_(raw.generated_at) } : {}),
    raw: toJsonValue(rawTraceability),
  };
}

function collectExtensions(root: RawObject, model: RawObject): Record<string, JsonValue> | undefined {
  const rootKnown = new Set(['schema_version', 'units', 'model', 'load_cases', 'load_combinations', 'traceability']);
  const modelKnown = new Set([
    'name', 'ndm', 'ndf', 'nodes', 'supports', 'materials', 'sections', 'elements',
    'constraints', 'nodal_masses', 'groups', 'result_extraction', 'traceability',
  ]);
  const rootExtra: Record<string, JsonValue> = {};
  const modelExtra: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(root)) {
    if (!rootKnown.has(key)) {
      const converted = toJsonValue(value);
      if (converted !== undefined) rootExtra[key] = converted;
    }
  }
  for (const [key, value] of Object.entries(model)) {
    if (!modelKnown.has(key)) {
      const converted = toJsonValue(value);
      if (converted !== undefined) modelExtra[key] = converted;
    }
  }
  const extensions: Record<string, JsonValue> = {};
  if (Object.keys(rootExtra).length > 0) extensions.root = rootExtra;
  if (Object.keys(modelExtra).length > 0) extensions.model = modelExtra;
  return Object.keys(extensions).length > 0 ? extensions : undefined;
}

function buildAnalysisMetadata(
  root: RawObject,
  model: RawObject,
  schemaVersion: string,
  units: RawObject,
  rawElements: unknown[],
): AnalysisMetadata {
  const unitStrings: Record<string, string> = {};
  for (const [key, value] of Object.entries(units)) unitStrings[key] = toString_(value);
  const localAxes: Record<string, LocalAxisMetadata> = {};
  for (const value of rawElements) {
    const raw = asObject(value);
    const axis = parseLocalAxis(raw);
    const tag = toPositiveInt(raw.tag);
    if (axis && tag) localAxes[String(tag)] = axis;
  }
  const traceability = parseTraceability(model.traceability ?? root.traceability);
  const extensions = collectExtensions(root, model);
  return {
    sourceFormat: 'analysis-yaml',
    schemaVersion,
    units: unitStrings,
    ndm: toPositiveInt(model.ndm) || undefined,
    ndf: toPositiveInt(model.ndf) || undefined,
    constraints: parseEqualDOFConstraints(model.constraints),
    nodalMasses: parseNodalMasses(model.nodal_masses),
    linkElements: parseLinkMetadata(rawElements),
    localAxes,
    groups: parseGroups(model.groups),
    ...(model.result_extraction != null ? { resultExtraction: toJsonValue(model.result_extraction) } : {}),
    ...(traceability ? { traceability } : {}),
    ...(extensions ? { extensions } : {}),
  };
}

function parseYamlLoadCases(rawLoadCases: unknown): LoadCase[] {
  const cases: LoadCase[] = [];
  const usedIds = new Set<string>();
  for (const [{ key, value }, index] of asEntries(rawLoadCases).map((entry, index) => [entry, index] as const)) {
    const raw = asObject(value);
    let id = toString_(raw.id ?? raw.load_case_id ?? raw.tag ?? key).trim() || `LC${index + 1}`;
    if (usedIds.has(id)) {
      let serial = index + 1;
      while (usedIds.has(`LC${serial}`)) serial++;
      id = `LC${serial}`;
    }
    usedIds.add(id);
    cases.push(new LoadCase(
      id,
      toString_(raw.name ?? key).trim() || `Load Case ${index + 1}`,
      toString_(raw.type ?? raw.category).trim() || LoadCaseType.Other,
      toString_(raw.memo ?? raw.description),
    ));
  }
  return cases.length > 0 ? cases : [new LoadCase('LC1', 'Load Case 1')];
}

function parseCombinationTerms(value: unknown, caseIdByName: Map<string, string>): LoadCombinationTerm[] {
  if (Array.isArray(value)) {
    return value.map(item => {
      const raw = asObject(item);
      const reference = toString_(raw.loadCaseId ?? raw.load_case_id ?? raw.load_case ?? raw.case ?? raw.name);
      return {
        loadCaseId: caseIdByName.get(reference) ?? reference,
        factor: toNumber(raw.factor ?? raw.scale),
      };
    });
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as RawObject).map(([reference, factor]) => ({
      loadCaseId: caseIdByName.get(reference) ?? reference,
      factor: toNumber(factor),
    }));
  }
  return [];
}

function parseYamlLoadCombinations(rawCombinations: unknown, loadCases: LoadCase[]): LoadCombination[] {
  const byName = new Map<string, string>();
  for (const loadCase of loadCases) {
    byName.set(loadCase.id, loadCase.id);
    byName.set(loadCase.name, loadCase.id);
  }
  return asEntries(rawCombinations).map(({ key, value }, index) => {
    const raw = asObject(value);
    const id = toString_(raw.id ?? key).trim() || `COMB${index + 1}`;
    const termsSource = raw.terms ?? raw.factors ?? raw.components;
    return new LoadCombination(
      id,
      toString_(raw.name ?? key).trim() || `Combination ${index + 1}`,
      parseCombinationTerms(termsSource, byName),
      toString_(raw.memo ?? raw.description),
    );
  });
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
      diagnostics.push(makeDiagnostic(
        'info',
        'link_metadata_preserved',
        `twoNodeLink3D element ${tag} is imported as a display member; stiffness/orientation metadata is retained in analysisMetadata.`,
        tag,
      ));
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

function assignLoadCaseDefaults(nodes: Node[], members: Member[], count: number): void {
  for (const node of nodes) node.setLoadCaseCount(count);
  for (const member of members) member.setLoadCaseCount(count);
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
    'analysisMetadata=constraints,nodal_masses,groups,result_extraction,traceability,link_metadata',
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
  const loadCases = parseYamlLoadCases(root.load_cases);
  const loadCombinations = parseYamlLoadCombinations(root.load_combinations, loadCases);
  const analysisMetadata = buildAnalysisMetadata(root, model, schemaVersion, units, rawElements);

  assignLoadCaseDefaults(nodes, members, loadCases.length);

  const result: FrameYamlImportResult = {
    diagnostics,
    importedNodeCount: nodes.length,
    importedMemberCount: members.length,
    skippedElementCount,
  };

  const imported = new FrameDocument();
  imported.title = toString_(model.name);
  imported.nodes = nodes;
  imported.materials = materials;
  imported.sections = sectionResult.sections;
  imported.members = members;
  imported.boundaries = boundaries;
  imported.loadCases = loadCases;
  imported.loadCaseCount = loadCases.length;
  imported.loadCombinations = loadCombinations;
  imported.analysisMetadata = analysisMetadata;
  for (const boundary of imported.boundaries) {
    const node = nodeMap.get(boundary.nodeNumber);
    if (node) node.boundaryCondition = boundary;
  }
  appendImportMemo(imported, result);
  doc.replaceWith(imported);

  diagnostics.push(makeDiagnostic(
    'info',
    'analysis_metadata_preserved',
    `Preserved ${analysisMetadata.constraints.length} constraints, ${analysisMetadata.nodalMasses.length} nodal masses, ${analysisMetadata.linkElements.length} links and ${analysisMetadata.groups.length} groups.`,
  ));

  diagnostics.push(makeDiagnostic(
    'info',
    'import_summary',
    `Imported ${nodes.length} nodes, ${members.length} members, ${materials.length} materials, ${sectionResult.sections.length} sections; skipped ${skippedElementCount} elements.`,
  ));

  return result;
}

function uniqueReferenceName(base: string, used: Set<string>, fallback: string): string {
  let candidate = base.trim() || fallback;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base.trim() || fallback}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

/**
 * FrameDocumentを解析YAMLへ再出力する。analysisMetadataの型付き情報とraw拡張を優先して復元する。
 */
export function exportFrameAnalysisYaml(doc: FrameDocument): FrameYamlExportResult {
  const diagnostics: FrameYamlImportDiagnostic[] = [];
  const metadata = doc.analysisMetadata;
  const canonicalUnits: Record<string, string> = {
    length: 'mm',
    force: 'N',
    stress: 'N/mm^2',
    area: 'mm^2',
    second_moment: 'mm^4',
    translational_stiffness: 'N/mm',
    rotational_stiffness: 'N*mm/rad',
  };
  const metadataUnits = metadata?.units ?? {};
  const units: Record<string, string> = { ...metadataUnits, ...canonicalUnits };
  for (const [key, expected] of Object.entries(canonicalUnits)) {
    const actual = metadataUnits[key];
    if (actual != null && actual !== expected) {
      diagnostics.push({
        level: 'warn',
        code: 'analysis_units_normalized_for_export',
        message: `analysisMetadata.units.${key}="${actual}" was normalized to "${expected}" for analysis YAML export.`,
        sourcePath: `analysisMetadata.units.${key}`,
        details: { actual, expected },
      });
    }
  }

  const materialRefs = new Map<number, string>();
  const materialObject: RawObject = {};
  const usedMaterialRefs = new Set<string>();
  for (const material of doc.materials) {
    const ref = uniqueReferenceName(material.name, usedMaterialRefs, `material_${material.number}`);
    materialRefs.set(material.number, ref);
    materialObject[ref] = {
      type: 'ElasticMaterial',
      tag: material.number,
      elastic_modulus: material.young * 10,
      shear_modulus: material.shear * 10,
      poisson: material.poisson,
    };
  }

  const sectionRefs = new Map<number, string>();
  const sectionObject: RawObject = {};
  const usedSectionRefs = new Set<string>();
  for (const section of doc.sections) {
    const ref = uniqueReferenceName(section.comment, usedSectionRefs, `section_${section.number}`);
    sectionRefs.set(section.number, ref);
    sectionObject[ref] = {
      area: section.p1_A * 100,
      torsion_constant: section.torsionConstant * 10000,
      inertia_y: section.p3_Iy * 10000,
      inertia_z: section.p4_Iz * 10000,
      shear_area_y: section.p1_A * section.ky * 100,
      shear_area_z: section.p1_A * section.kz * 100,
    };
  }

  const linkByTag = new Map((metadata?.linkElements ?? []).map(link => [link.tag, link] as const));
  const exportedLinkTags = new Set<number>();
  const elements: RawObject[] = [];
  for (const member of doc.members) {
    const link = linkByTag.get(member.number);
    if (link) {
      const raw = asObject(link.raw);
      elements.push({
        ...raw,
        type: 'twoNodeLink3D',
        tag: member.number,
        node_i: member.iNodeNumber,
        node_j: member.jNodeNumber,
        dir: [...link.directions],
        stiffness: [...link.stiffness],
        ...(link.orientation?.x ? { orient_x: [...link.orientation.x] } : {}),
        ...(link.orientation?.y ? { orient_y: [...link.orientation.y] } : {}),
        ...(link.shearDistance ? { shear_dist: [...link.shearDistance] } : {}),
      });
      exportedLinkTags.add(link.tag);
      continue;
    }
    const section = doc.findSectionByNumber(member.sectionNumber);
    const localAxis = metadata?.localAxes[String(member.number)];
    elements.push({
      type: section?.type === SectionType.Truss ? 'truss3D' : 'elasticTimoshenkoBeam3D',
      tag: member.number,
      node_i: member.iNodeNumber,
      node_j: member.jNodeNumber,
      ...(section ? { section_ref: sectionRefs.get(section.number) } : {}),
      ...(section?.materialNumber ? { material_ref: materialRefs.get(section.materialNumber) } : {}),
      ...(localAxis?.vecxz ? { vecxz: [...localAxis.vecxz] } : {}),
      ...(localAxis?.x ? { orient_x: [...localAxis.x] } : {}),
      ...(localAxis?.y ? { orient_y: [...localAxis.y] } : {}),
    });
  }
  for (const link of metadata?.linkElements ?? []) {
    if (exportedLinkTags.has(link.tag)) continue;
    elements.push({
      ...asObject(link.raw),
      type: 'twoNodeLink3D',
      tag: link.tag,
      node_i: link.nodeI,
      node_j: link.nodeJ,
      dir: [...link.directions],
      stiffness: [...link.stiffness],
    });
    diagnostics.push(makeDiagnostic('warn', 'orphan_link_metadata_exported', `Link metadata ${link.tag} has no display member and was exported from metadata.`, link.tag));
  }

  const constraints = (metadata?.constraints ?? []).map(constraint => ({
    ...asObject(constraint.raw),
    type: 'equalDOF',
    ...(constraint.tag != null ? { tag: constraint.tag } : {}),
    retained_node: constraint.retainedNode,
    constrained_node: constraint.constrainedNode,
    dofs: [...constraint.dofs],
  }));
  const nodalMasses = (metadata?.nodalMasses ?? []).map(mass => ({
    ...asObject(mass.raw),
    node_tag: mass.nodeTag,
    values: [...mass.values],
  }));
  const groups = (metadata?.groups ?? []).map(group => ({
    ...asObject(group.raw),
    name: group.name,
    node_tags: [...group.nodeTags],
    element_tags: [...group.elementTags],
  }));

  const modelExtensions = asObject(metadata?.extensions?.model);
  const model: RawObject = {
    ...modelExtensions,
    name: doc.title,
    ndm: metadata?.ndm ?? 3,
    ndf: metadata?.ndf ?? 6,
    nodes: doc.nodes.map(node => ({ tag: node.number, x: node.x * 10, y: node.y * 10, z: node.z * 10 })),
    supports: doc.boundaries.map(boundary => ({
      node_tag: boundary.nodeNumber,
      dofs: [
        boundary.deltaX ? 'ux' : null,
        boundary.deltaY ? 'uy' : null,
        boundary.deltaZ ? 'uz' : null,
        boundary.thetaX ? 'rx' : null,
        boundary.thetaY ? 'ry' : null,
        boundary.thetaZ ? 'rz' : null,
      ].filter((value): value is string => value !== null),
    })),
    materials: materialObject,
    sections: sectionObject,
    elements,
    ...(constraints.length > 0 ? { constraints } : {}),
    ...(nodalMasses.length > 0 ? { nodal_masses: nodalMasses } : {}),
    ...(groups.length > 0 ? { groups } : {}),
    ...(metadata?.resultExtraction !== undefined ? { result_extraction: metadata.resultExtraction } : {}),
    ...(metadata?.traceability ? {
      traceability: {
        ...asObject(metadata.traceability.raw),
        ...(metadata.traceability.source ? { source: metadata.traceability.source } : {}),
        ...(metadata.traceability.generatedBy ? { generated_by: metadata.traceability.generatedBy } : {}),
        ...(metadata.traceability.generatedAt ? { generated_at: metadata.traceability.generatedAt } : {}),
      },
    } : {}),
  };

  const rootExtensions = asObject(metadata?.extensions?.root);
  const root: RawObject = {
    ...rootExtensions,
    schema_version: metadata?.schemaVersion || '1',
    units,
    model,
    load_cases: doc.loadCases.map(loadCase => ({
      id: loadCase.id,
      name: loadCase.name,
      type: loadCase.type,
      memo: loadCase.memo,
    })),
    load_combinations: doc.loadCombinations.map(combination => ({
      id: combination.id,
      name: combination.name,
      memo: combination.memo,
      terms: combination.terms.map(term => ({ load_case_id: term.loadCaseId, factor: term.factor })),
    })),
  };

  if (doc.walls.length > 0) diagnostics.push(makeDiagnostic('warn', 'walls_not_supported_by_analysis_yaml', `${doc.walls.length} wall(s) are not represented by the analysis YAML schema.`));
  if (doc.springs.length > 0) diagnostics.push(makeDiagnostic('warn', 'member_end_springs_not_supported_by_analysis_yaml', `${doc.springs.length} custom member-end spring(s) are not represented by the analysis YAML schema.`));
  const hasLoads = doc.nodes.some(node => node.loads.some(load => !load.isZero))
    || doc.members.some(member => member.memberLoads.some(load => !load.isZero) || member.cmqLoads.some(load => !load.isZero));
  if (hasLoads) diagnostics.push(makeDiagnostic('warn', 'loads_not_supported_by_analysis_yaml_export', 'FrameModelMaker node/member/CMQ load values are not represented by the current analysis YAML load schema.'));

  return { yaml: stringifyYaml(root), diagnostics };
}

export function writeFrameAnalysisYaml(doc: FrameDocument): string {
  return exportFrameAnalysisYaml(doc).yaml;
}
