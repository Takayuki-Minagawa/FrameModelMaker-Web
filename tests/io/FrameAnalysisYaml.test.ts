import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { FrameDocument } from '../../src/models/FrameDocument';
import { writeFrameJson } from '../../src/io/FrameJson';
import { exportFrameAnalysisYaml, parseFrameAnalysisYaml } from '../../src/io/FrameAnalysisYaml';
import { Section, SectionType } from '../../src/models/Section';

const SAMPLE_YAML = `
schema_version: '1'
units:
  length: mm
  force: N
  stress: N/mm^2
  area: mm^2
  second_moment: mm^4
model:
  name: yaml-sample
  ndm: 3
  ndf: 6
  nodes:
    - { tag: 1, x: 0, y: 0, z: 0 }
    - { tag: 2, x: 1000, y: 0, z: 0 }
    - { tag: 3, x: 1000, y: 0, z: 0 }
    - { tag: 4, x: 1000, y: 1000, z: 0 }
    - { tag: 5, x: 1000.5, y: 0, z: 0 }
  supports:
    - { node_tag: 1, dofs: [ux, uy, uz, rx, ry, rz] }
    - { node_tag: 2, dofs: [ux, rz] }
    - { node_tag: 99, dofs: [ux] }
  materials:
    steel:
      type: ElasticMaterial
      tag: 1
      elastic_modulus: 205000
      shear_modulus: 79000
  sections:
    B:
      area: 20000
      inertia_y: 66700000
      inertia_z: 16700000
      torsion_constant: 20000000
      shear_area_y: 16000
      shear_area_z: 12000
  elements:
    - { type: elasticTimoshenkoBeam3D, tag: 1001, node_i: 1, node_j: 2, material_ref: steel, section_ref: B }
    - { type: truss3D, tag: 2001, node_i: 2, node_j: 4, material_ref: steel }
    - { type: twoNodeLink3D, tag: 3001, node_i: 2, node_j: 3, dir: [ry], stiffness: [200000000] }
    - { type: twoNodeLink3D, tag: 3002, node_i: 2, node_j: 5, dir: [ry], stiffness: [200000000] }
    - { type: elasticTimoshenkoBeam3D, tag: 4001, node_i: 2, node_j: 3, material_ref: steel, section_ref: B }
    - { type: elasticTimoshenkoBeam3D, tag: 5001, node_i: 2, node_j: 99, material_ref: steel, section_ref: B }
load_cases: []
load_combinations: []
`;

describe('FrameAnalysisYaml', () => {
  it('imports analysis YAML into the frame document model', () => {
    const doc = new FrameDocument();
    const result = parseFrameAnalysisYaml(SAMPLE_YAML, doc);

    expect(doc.title).toBe('yaml-sample');
    expect(doc.nodes).toHaveLength(5);
    expect(doc.nodes[1].number).toBe(2);
    expect(doc.nodes[1].x).toBeCloseTo(100);
    expect(doc.nodes[1].y).toBeCloseTo(0);

    expect(doc.materials).toHaveLength(1);
    expect(doc.materials[0].number).toBe(1);
    expect(doc.materials[0].young).toBeCloseTo(20500);
    expect(doc.materials[0].shear).toBeCloseTo(7900);

    const beamSection = doc.sections.find(section => section.comment === 'B');
    expect(beamSection).toBeDefined();
    expect(beamSection?.materialNumber).toBe(1);
    expect(beamSection?.p1_A).toBeCloseTo(200);
    expect(beamSection?.p2_Ix).toBeCloseTo(2000);
    expect(beamSection?.p3_Iy).toBeCloseTo(6670);
    expect(beamSection?.p4_Iz).toBeCloseTo(1670);
    expect(beamSection?.ky).toBeCloseTo(0.8);
    expect(beamSection?.kz).toBeCloseTo(0.6);

    expect(doc.boundaries).toHaveLength(2);
    expect(doc.nodes[0].boundaryCondition).not.toBeNull();
    expect(doc.boundaries[0]).toMatchObject({
      nodeNumber: 1,
      deltaX: 1,
      deltaY: 1,
      deltaZ: 1,
      thetaX: 1,
      thetaY: 1,
      thetaZ: 1,
    });
    expect(doc.boundaries[1]).toMatchObject({
      nodeNumber: 2,
      deltaX: 1,
      deltaY: 0,
      deltaZ: 0,
      thetaX: 0,
      thetaY: 0,
      thetaZ: 1,
    });

    expect(doc.members.map(member => member.number)).toEqual([1001, 2001, 3001, 3002]);
    expect(doc.members[0]).toMatchObject({ iNodeNumber: 1, jNodeNumber: 2, sectionNumber: beamSection?.number });
    expect(doc.members[1].sectionNumber).toBeGreaterThan(0);
    expect(doc.sections.find(section => section.number === doc.members[1].sectionNumber)?.type).toBe(SectionType.Truss);
    expect(doc.members[2]).toMatchObject({ iNodeNumber: 2, jNodeNumber: 3 });
    expect(doc.sections.find(section => section.number === doc.members[2].sectionNumber)?.comment).toContain('twoNodeLink3D');

    expect(result.importedNodeCount).toBe(5);
    expect(result.importedMemberCount).toBe(4);
    expect(result.skippedElementCount).toBe(2);
    expect(result.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining([
      'missing_support_node',
      'zero_length_link_element',
      'short_link_element',
      'link_metadata_preserved',
      'zero_length_frame_element',
      'missing_element_node',
      'import_summary',
    ]));
    expect(doc.calcCaseMemo).toEqual(expect.arrayContaining([
      'ANALYSIS-YAML-IMPORT',
      'nodes=5',
      'members=4',
      'skippedElements=2',
    ]));
  });

  it('preserves typed analysis metadata and can export it again', () => {
    const doc = new FrameDocument();
    parseFrameAnalysisYaml(SAMPLE_YAML.replace(
      '  supports:',
      `  constraints:\n    - { type: equalDOF, retained_node: 1, constrained_node: 2, dofs: [ux, uy] }\n  nodal_masses:\n    - { node_tag: 2, values: [1, 2, 3, 0, 0, 0] }\n  groups:\n    main: { node_tags: [1, 2], element_tags: [1001] }\n  supports:`,
    ), doc);

    expect(doc.analysisMetadata?.constraints[0]).toMatchObject({ retainedNode: 1, constrainedNode: 2, dofs: ['ux', 'uy'] });
    expect(doc.analysisMetadata?.nodalMasses[0].values).toEqual([1, 2, 3, 0, 0, 0]);
    expect(doc.analysisMetadata?.linkElements).toHaveLength(2);

    const exported = exportFrameAnalysisYaml(doc);
    expect(exported.yaml).toContain('equalDOF');
    expect(exported.yaml).toContain('stiffness');
    const restored = new FrameDocument();
    parseFrameAnalysisYaml(exported.yaml, restored);
    expect(restored.analysisMetadata?.constraints).toHaveLength(1);
    expect(restored.analysisMetadata?.linkElements).toHaveLength(2);
  });

  it('exports an explicit zero torsion constant without falling back to p2_Ix', () => {
    const doc = new FrameDocument();
    const section = new Section();
    section.number = 1;
    section.p2_Ix = 12;
    section.torsionConstant = 0;
    doc.sections = [section];

    const exported = exportFrameAnalysisYaml(doc);

    expect(exported.yaml).toMatch(/torsion_constant:\s+0(?:\r?\n|$)/);
  });

  it('keeps the imported document writable as the current JSON format', () => {
    const doc = new FrameDocument();
    parseFrameAnalysisYaml(SAMPLE_YAML, doc);

    const json = JSON.parse(writeFrameJson(doc));

    expect(json.title).toBe('yaml-sample');
    expect(json.nodes).toHaveLength(5);
    expect(json.members).toHaveLength(4);
    expect(json.calcCaseMemo).toContain('ANALYSIS-YAML-IMPORT');
  });

  it('rejects duplicate node or element tags without mutating the document', () => {
    const doc = new FrameDocument();
    doc.title = 'unchanged';

    expect(() => parseFrameAnalysisYaml(`
schema_version: '1'
units:
  length: mm
  force: N
  stress: N/mm^2
  area: mm^2
  second_moment: mm^4
model:
  nodes:
    - { tag: 1, x: 0, y: 0, z: 0 }
    - { tag: 1, x: 1, y: 0, z: 0 }
  elements:
    - { type: elasticTimoshenkoBeam3D, tag: 10, node_i: 1, node_j: 1 }
    - { type: elasticTimoshenkoBeam3D, tag: 10, node_i: 1, node_j: 1 }
`, doc)).toThrow('Duplicate node tag 1');
    expect(doc.title).toBe('unchanged');
  });

  it('rejects YAML documents without a model object', () => {
    const doc = new FrameDocument();

    expect(() => parseFrameAnalysisYaml('schema_version: 1', doc)).toThrow('root.model must be an object');
  });

  it('rejects unsupported schema shapes and units before mutating the document', () => {
    const doc = new FrameDocument();
    doc.title = 'unchanged';

    expect(() => parseFrameAnalysisYaml(`
schema_version: '2'
units:
  length: mm
  force: N
  stress: N/mm^2
  area: mm^2
  second_moment: mm^4
model:
  nodes: []
  elements: []
`, doc)).toThrow('schema_version must be "1"');

    expect(() => parseFrameAnalysisYaml(`
schema_version: '1'
units:
  length: m
  force: N
  stress: N/mm^2
  area: mm^2
  second_moment: mm^4
model:
  nodes: []
  elements: []
`, doc)).toThrow('units.length must be "mm"');

    expect(() => parseFrameAnalysisYaml(`
schema_version: '1'
units:
  length: mm
  force: kN
  stress: N/mm^2
  area: mm^2
  second_moment: mm^4
model:
  nodes: []
  elements: []
`, doc)).toThrow('units.force must be "N"');

    expect(() => parseFrameAnalysisYaml(`
schema_version: '1'
units:
  length: mm
  force: N
  stress: N/mm^2
  area: mm^2
  second_moment: mm^4
model:
  nodes: {}
  elements: []
`, doc)).toThrow('model.nodes must be an array');

    expect(doc.title).toBe('unchanged');
  });

  it('warns when a section is referenced with multiple materials', () => {
    const doc = new FrameDocument();
    const result = parseFrameAnalysisYaml(`
schema_version: '1'
units:
  length: mm
  force: N
  stress: N/mm^2
  area: mm^2
  second_moment: mm^4
model:
  nodes:
    - { tag: 1, x: 0, y: 0, z: 0 }
    - { tag: 2, x: 1000, y: 0, z: 0 }
    - { tag: 3, x: 0, y: 1000, z: 0 }
  materials:
    steel: { tag: 1, elastic_modulus: 205000, shear_modulus: 79000 }
    alc: { tag: 2, elastic_modulus: 1800, shear_modulus: 750 }
  sections:
    B:
      area: 20000
      inertia_y: 66700000
      inertia_z: 16700000
      torsion_constant: 20000000
      shear_area_y: 16000
      shear_area_z: 16000
  elements:
    - { type: elasticTimoshenkoBeam3D, tag: 1001, node_i: 1, node_j: 2, material_ref: steel, section_ref: B }
    - { type: elasticTimoshenkoBeam3D, tag: 1002, node_i: 1, node_j: 3, material_ref: alc, section_ref: B }
`, doc);

    expect(doc.sections.find(section => section.comment === 'B')?.materialNumber).toBe(1);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'warn',
        code: 'section_material_ref_conflict',
        tag: 1002,
      }),
    ]));
  });

  it.skipIf(!process.env.FRAME_ANALYSIS_YAML_FIXTURE || !existsSync(process.env.FRAME_ANALYSIS_YAML_FIXTURE ?? ''))(
    'imports an external analysis YAML fixture when provided',
    () => {
      const path = process.env.FRAME_ANALYSIS_YAML_FIXTURE!;
      const doc = new FrameDocument();
      const result = parseFrameAnalysisYaml(readFileSync(path, 'utf8'), doc);

      expect(doc.nodes).toHaveLength(76);
      expect(doc.members).toHaveLength(79);
      expect(result.skippedElementCount).toBe(0);
      expect(result.diagnostics.map(d => d.code)).toContain('short_link_element');
      expect(writeFrameJson(doc)).toContain('"title": "Test0202-floor-vibration-trial"');
    },
  );
});
