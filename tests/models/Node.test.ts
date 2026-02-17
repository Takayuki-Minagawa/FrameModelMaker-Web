import { describe, it, expect } from 'vitest';
import { Node } from '../../src/models/Node';

describe('Node', () => {
  describe('constructor', () => {
    it('should create a node with default coordinates (0,0,0)', () => {
      const node = new Node();
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.z).toBe(0);
    });

    it('should create a node with specified coordinates', () => {
      const node = new Node(1.5, 2.5, 3.5);
      expect(node.x).toBe(1.5);
      expect(node.y).toBe(2.5);
      expect(node.z).toBe(3.5);
    });
  });

  describe('compareTo', () => {
    it('should sort by Z first (ascending)', () => {
      const a = new Node(0, 0, 1);
      const b = new Node(0, 0, 2);
      expect(a.compareTo(b)).toBeLessThan(0);
      expect(b.compareTo(a)).toBeGreaterThan(0);
    });

    it('should sort by Y second when Z is equal', () => {
      const a = new Node(0, 1, 5);
      const b = new Node(0, 2, 5);
      expect(a.compareTo(b)).toBeLessThan(0);
    });

    it('should sort by X third when Z and Y are equal', () => {
      const a = new Node(1, 5, 5);
      const b = new Node(2, 5, 5);
      expect(a.compareTo(b)).toBeLessThan(0);
    });

    it('should return 0 for identical coordinates', () => {
      const a = new Node(1, 2, 3);
      const b = new Node(1, 2, 3);
      expect(a.compareTo(b)).toBe(0);
    });
  });

  describe('getLoad', () => {
    it('should auto-expand loads array to requested index', () => {
      const node = new Node();
      const load = node.getLoad(2);
      expect(node.loads.length).toBe(3);
      expect(load.isZero).toBe(true);
    });

    it('should return existing load if already allocated', () => {
      const node = new Node();
      const load1 = node.getLoad(0);
      load1.p1 = 10;
      const load2 = node.getLoad(0);
      expect(load2.p1).toBe(10);
    });
  });

  describe('setLoadCaseCount', () => {
    it('should expand loads when count increases', () => {
      const node = new Node();
      node.setLoadCaseCount(3);
      expect(node.loads.length).toBe(3);
    });

    it('should truncate loads when count decreases', () => {
      const node = new Node();
      node.setLoadCaseCount(5);
      node.setLoadCaseCount(2);
      expect(node.loads.length).toBe(2);
    });
  });

  describe('removeLoad', () => {
    it('should remove load at specified index', () => {
      const node = new Node();
      node.setLoadCaseCount(3);
      node.getLoad(1).p1 = 99;
      node.removeLoad(0);
      expect(node.loads.length).toBe(2);
      expect(node.loads[0].p1).toBe(99);
    });
  });
});
