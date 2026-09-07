import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { FrameDocument } = await server.ssrLoadModule('/src/models/FrameDocument.ts');
  const { Material } = await server.ssrLoadModule('/src/models/Material.ts');
  const { Section } = await server.ssrLoadModule('/src/models/Section.ts');
  const { BoundaryCondition } = await server.ssrLoadModule('/src/models/BoundaryCondition.ts');
  const { toFrameJson } = await server.ssrLoadModule('/src/io/FrameJson.ts');
  const { modelFingerprint } = await server.ssrLoadModule('/src/services/ModelFingerprint.ts');
  const { convertOpenSeesResults } = await server.ssrLoadModule('/src/io/OpenSeesResults.ts');
  const doc = new FrameDocument();
  doc.title = 'Cantilever verification: cm-kN';
  doc.addNode(doc.createNode(0, 0, 0));
  doc.addNode(doc.createNode(100, 0, 0));
  doc.nodes[1].loads[0].p2 = -1;
  const material = Object.assign(new Material(), {
    number: 1,
    name: 'Verification',
    young: 20000,
    shear: 8000,
  });
  doc.materials.push(material);
  const section = Object.assign(new Section(), {
    number: 1,
    materialNumber: 1,
    p1_A: 10,
    torsionConstant: 100,
    p3_Iy: 50,
    p4_Iz: 50,
  });
  doc.sections.push(section);
  const m = doc.createMember();
  m.iNodeNumber = 1;
  m.jNodeNumber = 2;
  m.sectionNumber = 1;
  doc.addMember(m);
  doc.boundaries.push(
    Object.assign(new BoundaryCondition(), {
      nodeNumber: 1,
      deltaX: 1,
      deltaY: 1,
      deltaZ: 1,
      thetaX: 1,
      thetaY: 1,
      thetaZ: 1,
    }),
  );
  doc.synchronizeBoundaryConditions();
  const fingerprint = await modelFingerprint(doc);
  const binding = {
    format: 'framemodelmaker-binding-v1',
    modelFingerprint: fingerprint,
    units: { length: 'cm', force: 'kN', time: 's' },
    nodes: [
      { tag: 1, nodeNumber: 1, coordinates: [0, 0, 0] },
      { tag: 2, nodeNumber: 2, coordinates: [100, 0, 0] },
    ],
    members: [{ tag: 1, memberNumber: 1, nodeI: 1, nodeJ: 2, localY: [0, 1, 0] }],
  };
  const recorder = {
    ...binding,
    format: 'opensees-recorder-v1',
    forceConvention: 'local-end-resisting',
    title: 'Analytical cantilever reference',
    members: binding.members.map((m) => ({ ...m, type: 'elasticBeamColumn3D' })),
    frames: [
      {
        time: 1,
        nodes: [
          { tag: 1, displacement: [0, 0, 0, 0, 0, 0], reaction: [0, 1, 0, 0, 0, 100] },
          { tag: 2, displacement: [0, -1 / 3, 0, 0, 0, -0.005], reaction: [0, 0, 0, 0, 0, 0] },
        ],
        members: [
          {
            tag: 1,
            localForce: [0, 1, 0, 0, 0, 100, 0, -1, 0, 0, 0, 0],
            stations: [
              { position: 0, force: [0, -1, 0, 0, 0, -100] },
              { position: 0.5, force: [0, -1, 0, 0, 0, -50] },
              { position: 1, force: [0, -1, 0, 0, 0, 0] },
            ],
          },
        ],
      },
    ],
  };
  mkdirSync('public/samples/contracts', { recursive: true });
  for (const [name, value] of Object.entries({
    'frame-v2': toFrameJson(doc),
    binding: binding,
    'opensees-reference': recorder,
    'results-v1': await convertOpenSeesResults(JSON.stringify(recorder), doc),
    'invalid-result-units': {
      ...(await convertOpenSeesResults(JSON.stringify(recorder), doc)),
      units: { length: 'mm', force: 'N', moment: 'N-mm' },
    },
  }))
    writeFileSync(`public/samples/contracts/${name}.json`, JSON.stringify(value, null, 2) + '\n');
} finally {
  await server.close();
}
