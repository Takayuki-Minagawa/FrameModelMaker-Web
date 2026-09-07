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

import {
  RawObject,
  asArray,
  asEntries,
  asObject,
  toJsonValue,
  toNumber,
  toNumberArray,
  toPositionalNumberArray,
  toPositiveInt,
  toStringArray,
  toString_,
} from './FrameYamlValues';
export function parseLocalAxis(raw: RawObject): LocalAxisMetadata | undefined {
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

export function parseEqualDOFConstraints(rawConstraints: unknown): EqualDOFConstraintMetadata[] {
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

export function parseNodalMasses(rawMasses: unknown): NodalMassMetadata[] {
  return asEntries(rawMasses).map(({ key, value }) => {
    const raw = asObject(value);
    const direct = raw.values ?? raw.mass ?? raw.masses;
    let values = toPositionalNumberArray(direct);
    const componentFields = ['mx', 'my', 'mz', 'mrx', 'mry', 'mrz'] as const;
    if (values.length === 0 && componentFields.some((field) => raw[field] !== undefined)) {
      values = componentFields.map((field) => toNumber(raw[field], 0));
    }
    return {
      nodeTag: toPositiveInt(raw.node_tag ?? raw.node ?? key),
      values,
      raw: (toJsonValue(raw) ?? {}) as Record<string, JsonValue>,
    };
  });
}

export function parseLinkMetadata(rawElements: unknown[]): LinkElementMetadata[] {
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

export function parseGroups(rawGroups: unknown): AnalysisGroupMetadata[] {
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

export function parseTraceability(rawTraceability: unknown): SourceTraceabilityMetadata | undefined {
  if (!rawTraceability || typeof rawTraceability !== 'object') return undefined;
  const raw = asObject(rawTraceability);
  return {
    ...(raw.source != null ? { source: toString_(raw.source) } : {}),
    ...(raw.generated_by != null ? { generatedBy: toString_(raw.generated_by) } : {}),
    ...(raw.generated_at != null ? { generatedAt: toString_(raw.generated_at) } : {}),
    raw: toJsonValue(rawTraceability),
  };
}

export function collectExtensions(root: RawObject, model: RawObject): Record<string, JsonValue> | undefined {
  const rootKnown = new Set([
    'schema_version',
    'units',
    'model',
    'load_cases',
    'load_combinations',
    'traceability',
  ]);
  const modelKnown = new Set([
    'name',
    'ndm',
    'ndf',
    'nodes',
    'supports',
    'materials',
    'sections',
    'elements',
    'constraints',
    'nodal_masses',
    'groups',
    'result_extraction',
    'traceability',
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

export function buildAnalysisMetadata(
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
