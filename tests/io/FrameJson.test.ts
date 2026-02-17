import { describe, it, expect } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Node } from '../../src/models/Node';
import { Member } from '../../src/models/Member';
import { BoundaryCondition } from '../../src/models/BoundaryCondition';
import { Material } from '../../src/models/Material';
import { Section } from '../../src/models/Section';
import { Spring } from '../../src/models/Spring';
import { Wall } from '../../src/models/Wall';
import { parseFrameJson, writeFrameJson } from '../../src/io/FrameJson';

function makeDoc(): FrameDocument {
  const doc = new FrameDocument();
  doc.title = 'JSONTest';

  const node = new Node(10, 20, 30);
  node.number = 1;
  const nodeLoad = node.getLoad(0);
  nodeLoad.p1 = 1.5;
  nodeLoad.m3 = 3.5;
  doc.nodes.push(node);

  const boundary = new BoundaryCondition();
  boundary.nodeNumber = 1;
  boundary.deltaX = 1;
  boundary.deltaY = 1;
  boundary.deltaZ = 1;
  doc.boundaries.push(boundary);
  node.boundaryCondition = boundary;

  const material = new Material();
  material.number = 1;
  material.young = 2100;
  material.name = 'Steel';
  doc.materials.push(material);

  const section = new Section();
  section.number = 1;
  section.materialNumber = 1;
  section.p1_A = 100;
  doc.sections.push(section);

  const spring = new Spring();
  spring.number = 3;
  spring.method = 1;
  spring.kTheta = 2000;
  doc.springs.push(spring);

  const member = new Member();
  member.number = 1;
  member.iNodeNumber = 1;
  member.jNodeNumber = 1;
  member.sectionNumber = 1;
  const memberLoad = member.getMemberLoad(0);
  memberLoad.type = 2;
  memberLoad.p1 = 5;
  const cmqLoad = member.getCMQLoad(0);
  cmqLoad.moy = 4;
  doc.members.push(member);

  const wall = new Wall();
  wall.number = 1;
  wall.leftBottomNode = 1;
  wall.rightBottomNode = 1;
  wall.leftTopNode = 1;
  wall.rightTopNode = 1;
  wall.materialNumber = 1;
  doc.walls.push(wall);

  doc.loadCaseCount = 1;
  doc.loadCaseIndex = 0;
  doc.calcCaseMemo = ['CALCULATION-CASE', 'sample memo'];
  return doc;
}

describe('FrameJson', () => {
  it('should round-trip frame document data', () => {
    const doc1 = makeDoc();
    const json = writeFrameJson(doc1);

    const doc2 = new FrameDocument();
    parseFrameJson(json, doc2);

    expect(doc2.title).toBe(doc1.title);
    expect(doc2.nodes).toHaveLength(1);
    expect(doc2.nodes[0].number).toBe(1);
    expect(doc2.nodes[0].x).toBeCloseTo(10);
    expect(doc2.nodes[0].loads[0].p1).toBeCloseTo(1.5);
    expect(doc2.members).toHaveLength(1);
    expect(doc2.members[0].memberLoads[0].p1).toBeCloseTo(5);
    expect(doc2.members[0].cmqLoads[0].moy).toBeCloseTo(4);
    expect(doc2.boundaries).toHaveLength(1);
    expect(doc2.nodes[0].boundaryCondition).not.toBeNull();
    expect(doc2.materials[0].name).toBe('Steel');
    expect(doc2.sections[0].p1_A).toBeCloseTo(100);
    expect(doc2.springs[0].number).toBe(3);
    expect(doc2.walls).toHaveLength(1);
    expect(doc2.calcCaseMemo).toEqual(['CALCULATION-CASE', 'sample memo']);
  });

  it('should infer loadCaseCount from node/member load arrays', () => {
    const text = JSON.stringify({
      title: 'InferCases',
      loadCaseCount: 1,
      nodes: [
        {
          number: 1,
          x: 0,
          y: 0,
          z: 0,
          loads: [{ p1: 1 }, { p1: 2 }],
        },
      ],
      members: [
        {
          number: 1,
          iNodeNumber: 1,
          jNodeNumber: 1,
          memberLoads: [{ p1: 1 }, { p1: 2 }, { p1: 3 }],
          cmqLoads: [{ moy: 1 }],
        },
      ],
    });

    const doc = new FrameDocument();
    parseFrameJson(text, doc);

    expect(doc.loadCaseCount).toBe(3);
    expect(doc.nodes[0].loads).toHaveLength(3);
    expect(doc.members[0].memberLoads).toHaveLength(3);
    expect(doc.members[0].cmqLoads).toHaveLength(3);
  });

  it('should throw when json root is not an object', () => {
    const doc = new FrameDocument();
    expect(() => parseFrameJson('[]', doc)).toThrow('root must be an object');
  });
});
