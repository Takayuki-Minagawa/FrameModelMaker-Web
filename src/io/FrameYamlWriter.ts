import { stringify as stringifyYaml } from 'yaml';
import { FrameDocument } from '../models/FrameDocument';
import { SectionType } from '../models/Section';

import {
  FrameYamlExportResult,
  FrameYamlImportDiagnostic,
  RawObject,
  asObject,
  makeDiagnostic,
} from './FrameYamlValues';
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

  const linkByTag = new Map((metadata?.linkElements ?? []).map((link) => [link.tag, link] as const));
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
    diagnostics.push(
      makeDiagnostic(
        'warn',
        'orphan_link_metadata_exported',
        `Link metadata ${link.tag} has no display member and was exported from metadata.`,
        link.tag,
      ),
    );
  }

  const constraints = (metadata?.constraints ?? []).map((constraint) => ({
    ...asObject(constraint.raw),
    type: 'equalDOF',
    ...(constraint.tag != null ? { tag: constraint.tag } : {}),
    retained_node: constraint.retainedNode,
    constrained_node: constraint.constrainedNode,
    dofs: [...constraint.dofs],
  }));
  const nodalMasses = (metadata?.nodalMasses ?? []).map((mass) => ({
    ...asObject(mass.raw),
    node_tag: mass.nodeTag,
    values: [...mass.values],
  }));
  const groups = (metadata?.groups ?? []).map((group) => ({
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
    nodes: doc.nodes.map((node) => ({ tag: node.number, x: node.x * 10, y: node.y * 10, z: node.z * 10 })),
    supports: doc.boundaries.map((boundary) => ({
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
    ...(metadata?.traceability
      ? {
          traceability: {
            ...asObject(metadata.traceability.raw),
            ...(metadata.traceability.source ? { source: metadata.traceability.source } : {}),
            ...(metadata.traceability.generatedBy ? { generated_by: metadata.traceability.generatedBy } : {}),
            ...(metadata.traceability.generatedAt ? { generated_at: metadata.traceability.generatedAt } : {}),
          },
        }
      : {}),
  };

  const rootExtensions = asObject(metadata?.extensions?.root);
  const root: RawObject = {
    ...rootExtensions,
    schema_version: metadata?.schemaVersion || '1',
    units,
    model,
    load_cases: doc.loadCases.map((loadCase) => ({
      id: loadCase.id,
      name: loadCase.name,
      type: loadCase.type,
      memo: loadCase.memo,
    })),
    load_combinations: doc.loadCombinations.map((combination) => ({
      id: combination.id,
      name: combination.name,
      memo: combination.memo,
      terms: combination.terms.map((term) => ({ load_case_id: term.loadCaseId, factor: term.factor })),
    })),
  };

  if (doc.walls.length > 0)
    diagnostics.push(
      makeDiagnostic(
        'warn',
        'walls_not_supported_by_analysis_yaml',
        `${doc.walls.length} wall(s) are not represented by the analysis YAML schema.`,
      ),
    );
  if (doc.springs.length > 0)
    diagnostics.push(
      makeDiagnostic(
        'warn',
        'member_end_springs_not_supported_by_analysis_yaml',
        `${doc.springs.length} custom member-end spring(s) are not represented by the analysis YAML schema.`,
      ),
    );
  const hasLoads =
    doc.nodes.some((node) => node.loads.some((load) => !load.isZero)) ||
    doc.members.some(
      (member) =>
        member.memberLoads.some((load) => !load.isZero) || member.cmqLoads.some((load) => !load.isZero),
    );
  if (hasLoads)
    diagnostics.push(
      makeDiagnostic(
        'warn',
        'loads_not_supported_by_analysis_yaml_export',
        'FrameModelMaker node/member/CMQ load values are not represented by the current analysis YAML load schema.',
      ),
    );

  return { yaml: stringifyYaml(root), diagnostics };
}

export function writeFrameAnalysisYaml(doc: FrameDocument): string {
  return exportFrameAnalysisYaml(doc).yaml;
}
