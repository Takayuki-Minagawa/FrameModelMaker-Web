import { describe, expect, it } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Node } from '../../src/models/Node';
import { Member } from '../../src/models/Member';
import { BoundaryCondition } from '../../src/models/BoundaryCondition';
import { Material } from '../../src/models/Material';
import { Section } from '../../src/models/Section';
import { Spring } from '../../src/models/Spring';
import { Wall } from '../../src/models/Wall';

describe('FrameDocument advanced integrity APIs', () => {
  it('renumbers every reference in one operation', () => {
    const doc = new FrameDocument();
    const n1 = new Node(); n1.number = 10;
    const n2 = new Node(10, 0, 0); n2.number = 20;
    const material = new Material(); material.number = 7;
    const section = new Section(); section.number = 9; section.materialNumber = 7;
    const spring = new Spring(); spring.number = 8;
    const member = new Member();
    Object.assign(member, { number: 50, iNodeNumber: 10, jNodeNumber: 20, sectionNumber: 9, ixSpring: 8 });
    const boundary = new BoundaryCondition(); boundary.nodeNumber = 10;
    const wall = new Wall();
    Object.assign(wall, { number: 30, leftBottomNode: 10, rightBottomNode: 20, leftTopNode: 10, rightTopNode: 20, materialNumber: 7 });
    doc.nodes = [n1, n2]; doc.materials = [material]; doc.sections = [section];
    doc.springs = [spring]; doc.members = [member]; doc.boundaries = [boundary]; doc.walls = [wall];

    doc.assignNumbers();

    expect(member).toMatchObject({ number: 1, iNodeNumber: 1, jNodeNumber: 2, sectionNumber: 1, ixSpring: 3 });
    expect(section.materialNumber).toBe(1);
    expect(boundary.nodeNumber).toBe(1);
    expect(wall).toMatchObject({ number: 1, leftBottomNode: 1, rightBottomNode: 2, materialNumber: 1 });
  });

  it('rejects ambiguous duplicate numbers without partial mutation', () => {
    const doc = new FrameDocument();
    const a = new Node(); a.number = 4;
    const b = new Node(); b.number = 4;
    doc.nodes = [a, b];
    expect(() => doc.assignNumbers()).toThrow('duplicate node');
    expect(doc.nodes.map(node => node.number)).toEqual([4, 4]);
  });

  it('renumbers analysis metadata references including local-axis keys', () => {
    const doc = new FrameDocument();
    const n1 = new Node(); n1.number = 10;
    const n2 = new Node(); n2.number = 20;
    const member = new Member();
    Object.assign(member, { number: 50, iNodeNumber: 10, jNodeNumber: 20 });
    doc.nodes = [n1, n2];
    doc.members = [member];
    doc.analysisMetadata = {
      sourceFormat: 'analysis-yaml',
      schemaVersion: '1',
      units: {},
      constraints: [{ type: 'equalDOF', retainedNode: 10, constrainedNode: 20, dofs: ['ux'] }],
      nodalMasses: [{ nodeTag: 20, values: [1] }],
      linkElements: [{ tag: 50, nodeI: 10, nodeJ: 20, directions: ['ux'], stiffness: [1] }],
      localAxes: { '50': { vecxz: [0, 0, 1] } },
      groups: [{ name: 'main', nodeTags: [10, 20], elementTags: [50] }],
    };

    doc.assignNumbers();

    expect(doc.analysisMetadata?.linkElements[0]).toMatchObject({ tag: 1, nodeI: 1, nodeJ: 2 });
    expect(doc.analysisMetadata?.localAxes).toEqual({ '1': { vecxz: [0, 0, 1] } });
    expect(doc.analysisMetadata?.groups[0]).toMatchObject({ nodeTags: [1, 2], elementTags: [1] });

    doc.changeEntityNumber('member', 1, 9);

    expect(doc.findMemberByNumber(9)).toBe(member);
    expect(doc.analysisMetadata?.linkElements[0].tag).toBe(9);
    expect(doc.analysisMetadata?.localAxes).toEqual({ '9': { vecxz: [0, 0, 1] } });
    expect(doc.analysisMetadata?.groups[0].elementTags).toEqual([9]);
  });

  it('does not overwrite orphan analysis tags while changing or assigning numbers', () => {
    const doc = new FrameDocument();
    const node = new Node(); node.number = 10;
    const member = new Member(); Object.assign(member, { number: 10, iNodeNumber: 10, jNodeNumber: 10 });
    doc.nodes = [node];
    doc.members = [member];
    doc.analysisMetadata = {
      sourceFormat: 'analysis-yaml', schemaVersion: '1', units: {}, constraints: [], nodalMasses: [],
      linkElements: [{ tag: 1, nodeI: 99, nodeJ: 10, directions: ['ux'], stiffness: [1] }],
      localAxes: { '1': { y: [0, 1, 0] } },
      groups: [{ name: 'orphans', nodeTags: [1], elementTags: [1] }],
    };

    expect(() => doc.changeEntityNumber('member', 10, 1)).toThrow('retained analysis metadata');
    expect(() => doc.changeEntityNumber('node', 10, 1)).toThrow('retained analysis metadata');
    expect(member.number).toBe(10);
    expect(node.number).toBe(10);

    const maps = doc.assignNumbers();
    expect(maps.members.get(10)).toBe(2);
    expect(maps.nodes.get(10)).toBe(2);
    expect(doc.analysisMetadata?.localAxes['1']).toEqual({ y: [0, 1, 0] });
    expect(doc.analysisMetadata?.linkElements[0].tag).toBe(1);
  });

  it('skips orphan analysis tags when allocating new node and member numbers', () => {
    const doc = new FrameDocument();
    const node = new Node(); node.number = 1;
    const member = new Member(); Object.assign(member, { number: 1, iNodeNumber: 1, jNodeNumber: 1 });
    doc.nodes = [node];
    doc.members = [member];
    doc.analysisMetadata = {
      sourceFormat: 'analysis-yaml', schemaVersion: '1', units: {}, constraints: [],
      nodalMasses: [{ nodeTag: 2, values: [1] }],
      linkElements: [],
      localAxes: { '2': { y: [0, 1, 0] } },
      groups: [{ name: 'orphan', nodeTags: [2], elementTags: [2] }],
    };

    expect(doc.newNodeNumber).toBe(3);
    expect(doc.newMemberNumber).toBe(3);
    expect(doc.createNode().number).toBe(3);
    expect(doc.createMember().number).toBe(3);
  });

  it('merges transitive components, loads and boundaries before deleting nodes', () => {
    const doc = new FrameDocument();
    const a = new Node(0, 0, 0); a.number = 1; a.loads[0].p1 = 1;
    const b = new Node(0.9, 0, 0); b.number = 2; b.loads[0].p1 = 2;
    const c = new Node(1.8, 0, 0); c.number = 3; c.loads[0].p1 = 3;
    const member = new Member(); Object.assign(member, { number: 1, iNodeNumber: 1, jNodeNumber: 3 });
    const ba = new BoundaryCondition(); ba.nodeNumber = 1; ba.deltaX = 1;
    const bc = new BoundaryCondition(); bc.nodeNumber = 3; bc.thetaZ = 1;
    doc.nodes = [a, b, c]; doc.members = [member]; doc.boundaries = [ba, bc];

    const result = doc.mergeOverlappingNodes(1);

    expect(result.mergedNodeCount).toBe(2);
    expect(result.removedMemberNumbers).toEqual([1]);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].loads[0].p1).toBe(6);
    expect(doc.boundaries[0]).toMatchObject({ nodeNumber: 1, deltaX: 1, thetaZ: 1 });
    expect(doc.nodes[0].boundaryCondition).toBe(doc.boundaries[0]);
  });

  it('merges overlapping nodes with duplicate external numbers without throwing', () => {
    const doc = new FrameDocument();
    const first = new Node(0, 0, 0); first.number = 4; first.loads[0].p1 = 1;
    const duplicate = new Node(0, 0, 0); duplicate.number = 4; duplicate.loads[0].p1 = 2;
    doc.nodes = [first, duplicate];

    const result = doc.mergeOverlappingNodes(0);

    expect(result.mergedNodeCount).toBe(1);
    expect(result.representativeByNodeNumber.get(4)).toBe(4);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0].loads[0].p1).toBe(3);
  });

  it('consolidates analysis metadata after merging nodes', () => {
    const doc = new FrameDocument();
    const a = new Node(0, 0, 0); a.number = 1;
    const b = new Node(0, 0, 0); b.number = 2;
    const c = new Node(10, 0, 0); c.number = 3;
    const removed = new Member();
    Object.assign(removed, { number: 10, iNodeNumber: 1, jNodeNumber: 2 });
    const kept = new Member();
    Object.assign(kept, { number: 20, iNodeNumber: 2, jNodeNumber: 3 });
    doc.nodes = [a, b, c];
    doc.members = [removed, kept];
    doc.analysisMetadata = {
      sourceFormat: 'analysis-yaml',
      schemaVersion: '1',
      units: {},
      constraints: [{ type: 'equalDOF', retainedNode: 1, constrainedNode: 2, dofs: ['ux'] }],
      nodalMasses: [
        { nodeTag: 1, values: [1] },
        { nodeTag: 2, values: [2, 3] },
      ],
      linkElements: [{ tag: 10, nodeI: 1, nodeJ: 2, directions: ['ux'], stiffness: [1] }],
      localAxes: {
        '10': { vecxz: [0, 0, 1] },
        '20': { vecxz: [0, 1, 0] },
      },
      groups: [{ name: 'main', nodeTags: [1, 2, 3], elementTags: [10, 20, 10] }],
    };

    doc.mergeOverlappingNodes(0);

    expect(doc.analysisMetadata?.constraints).toEqual([]);
    expect(doc.analysisMetadata?.nodalMasses).toEqual([{ nodeTag: 1, values: [3, 3] }]);
    expect(doc.analysisMetadata?.linkElements).toEqual([]);
    expect(doc.analysisMetadata?.localAxes).toEqual({ '20': { vecxz: [0, 1, 0] } });
    expect(doc.analysisMetadata?.groups[0]).toMatchObject({
      nodeTags: [1, 3],
      elementTags: [20],
    });
  });

  it('keeps at least one named load case and initializes new entities', () => {
    const doc = new FrameDocument();
    expect(doc.removeLoadCase(0)).toBe(false);
    doc.addLoadCase({ id: 'W', name: 'Wind' });
    const node = doc.createNode();
    const member = doc.createMember();
    expect(node.loads).toHaveLength(2);
    expect(member.memberLoads).toHaveLength(2);
    expect(member.cmqLoads).toHaveLength(2);
    expect(doc.createSpring().number).toBe(Spring.DEFAULT_SPRING_COUNT);
  });
});
