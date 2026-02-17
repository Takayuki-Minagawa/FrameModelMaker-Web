import { describe, it, expect } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Node } from '../../src/models/Node';
import { Member } from '../../src/models/Member';
import { Section } from '../../src/models/Section';
import { Material } from '../../src/models/Material';
import { Spring } from '../../src/models/Spring';

function makeDoc(): FrameDocument {
  const doc = new FrameDocument();
  doc.title = 'Test';

  const n1 = new Node(0, 0, 100); n1.number = 1;
  const n2 = new Node(100, 0, 0); n2.number = 2;
  const n3 = new Node(50, 50, 50); n3.number = 3;
  doc.nodes.push(n1, n2, n3);

  const m = new Member();
  m.number = 1; m.iNodeNumber = 1; m.jNodeNumber = 2;
  doc.members.push(m);

  const sec = new Section(); sec.number = 1;
  doc.sections.push(sec);

  const mat = new Material(); mat.number = 1;
  doc.materials.push(mat);

  return doc;
}

describe('FrameDocument', () => {
  describe('init', () => {
    it('should clear all arrays and reset state', () => {
      const doc = makeDoc();
      doc.init();
      expect(doc.title).toBe('');
      expect(doc.nodes).toHaveLength(0);
      expect(doc.members).toHaveLength(0);
      expect(doc.sections).toHaveLength(0);
      expect(doc.materials).toHaveLength(0);
      expect(doc.boundaries).toHaveLength(0);
      expect(doc.springs).toHaveLength(0);
      expect(doc.walls).toHaveLength(0);
      expect(doc.loadCaseCount).toBe(1);
      expect(doc.loadCaseIndex).toBe(0);
      expect(doc.calcCaseMemo).toHaveLength(0);
    });
  });

  describe('newNodeNumber / newMemberNumber', () => {
    it('should return max+1 for new node number', () => {
      const doc = makeDoc();
      expect(doc.newNodeNumber).toBe(4);
    });

    it('should return max+1 for new member number', () => {
      const doc = makeDoc();
      expect(doc.newMemberNumber).toBe(2);
    });

    it('should return 1 for empty document', () => {
      const doc = new FrameDocument();
      expect(doc.newNodeNumber).toBe(1);
      expect(doc.newMemberNumber).toBe(1);
    });
  });

  describe('findByNumber', () => {
    it('findNodeByNumber should return correct node', () => {
      const doc = makeDoc();
      const found = doc.findNodeByNumber(2);
      expect(found).toBeDefined();
      expect(found!.x).toBe(100);
    });

    it('findNodeByNumber should return undefined for missing', () => {
      const doc = makeDoc();
      expect(doc.findNodeByNumber(999)).toBeUndefined();
    });

    it('findSpringByNumber should return RIGID for number 1', () => {
      const doc = new FrameDocument();
      expect(doc.findSpringByNumber(1)).toBe(Spring.RIGID);
    });

    it('findSpringByNumber should return PIN for number 2', () => {
      const doc = new FrameDocument();
      expect(doc.findSpringByNumber(2)).toBe(Spring.PIN);
    });

    it('findSectionByNumber should return correct section', () => {
      const doc = makeDoc();
      expect(doc.findSectionByNumber(1)).toBeDefined();
      expect(doc.findSectionByNumber(99)).toBeUndefined();
    });

    it('findMaterialByNumber should return correct material', () => {
      const doc = makeDoc();
      expect(doc.findMaterialByNumber(1)).toBeDefined();
      expect(doc.findMaterialByNumber(99)).toBeUndefined();
    });
  });

  describe('assignNumbers', () => {
    it('should renumber nodes starting from 1', () => {
      const doc = makeDoc();
      doc.nodes[0].number = 10;
      doc.nodes[1].number = 20;
      doc.nodes[2].number = 30;
      doc.assignNumbers();
      expect(doc.nodes.map(n => n.number)).toEqual([1, 2, 3]);
    });

    it('should renumber members starting from 1', () => {
      const doc = makeDoc();
      doc.members[0].number = 50;
      doc.assignNumbers();
      expect(doc.members[0].number).toBe(1);
    });

    it('should renumber springs starting from DEFAULT_SPRING_COUNT', () => {
      const doc = makeDoc();
      const spring = new Spring();
      spring.number = 100;
      doc.springs.push(spring);
      doc.assignNumbers();
      expect(doc.springs[0].number).toBe(Spring.DEFAULT_SPRING_COUNT);
    });
  });

  describe('sort', () => {
    it('should sort nodes by Z then Y then X', () => {
      const doc = makeDoc();
      // nodes: n1(0,0,100), n2(100,0,0), n3(50,50,50)
      doc.sort();
      expect(doc.nodes[0].z).toBe(0);   // n2
      expect(doc.nodes[1].z).toBe(50);  // n3
      expect(doc.nodes[2].z).toBe(100); // n1
    });
  });

  describe('addLoadCase / removeLoadCase', () => {
    it('addLoadCase should increment count and expand node/member loads', () => {
      const doc = makeDoc();
      expect(doc.loadCaseCount).toBe(1);
      doc.addLoadCase();
      expect(doc.loadCaseCount).toBe(2);
      for (const n of doc.nodes) {
        expect(n.loads.length).toBe(2);
      }
    });

    it('removeLoadCase should decrement count', () => {
      const doc = makeDoc();
      doc.addLoadCase();
      doc.addLoadCase();
      expect(doc.loadCaseCount).toBe(3);
      doc.removeLoadCase(1);
      expect(doc.loadCaseCount).toBe(2);
    });

    it('removeLoadCase with invalid index should be no-op', () => {
      const doc = makeDoc();
      doc.removeLoadCase(-1);
      expect(doc.loadCaseCount).toBe(1);
      doc.removeLoadCase(5);
      expect(doc.loadCaseCount).toBe(1);
    });

    it('removeLoadCase should clamp loadCaseIndex if needed', () => {
      const doc = makeDoc();
      doc.addLoadCase();
      doc.loadCaseIndex = 1;
      doc.removeLoadCase(1);
      expect(doc.loadCaseIndex).toBe(0);
    });
  });

  describe('mergeOverlappingNodes', () => {
    it('should merge nodes within threshold distance', () => {
      const doc = new FrameDocument();
      const n1 = new Node(0, 0, 0); n1.number = 1;
      const n2 = new Node(0.5, 0, 0); n2.number = 2;
      const n3 = new Node(100, 0, 0); n3.number = 3;
      doc.nodes.push(n1, n2, n3);

      doc.mergeOverlappingNodes(1.0);
      expect(doc.nodes).toHaveLength(2);
    });

    it('should not merge nodes beyond threshold', () => {
      const doc = new FrameDocument();
      const n1 = new Node(0, 0, 0); n1.number = 1;
      const n2 = new Node(5, 0, 0); n2.number = 2;
      doc.nodes.push(n1, n2);

      doc.mergeOverlappingNodes(1.0);
      expect(doc.nodes).toHaveLength(2);
    });
  });

  describe('onChange / removeChangeListener', () => {
    it('should call registered listeners on notifyChange', () => {
      const doc = new FrameDocument();
      let called = false;
      doc.onChange(() => { called = true; });
      doc.notifyChange();
      expect(called).toBe(true);
    });

    it('removeChangeListener should unregister', () => {
      const doc = new FrameDocument();
      let count = 0;
      const listener = () => { count++; };
      doc.onChange(listener);
      doc.notifyChange();
      expect(count).toBe(1);
      doc.removeChangeListener(listener);
      doc.notifyChange();
      expect(count).toBe(1);
    });
  });
});
