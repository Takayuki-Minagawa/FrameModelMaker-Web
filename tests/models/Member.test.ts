import { describe, it, expect } from 'vitest';
import { Member } from '../../src/models/Member';

describe('Member', () => {
  describe('getMemberLoad', () => {
    it('should auto-expand memberLoads array', () => {
      const m = new Member();
      const load = m.getMemberLoad(2);
      expect(m.memberLoads.length).toBe(3);
      expect(load.isZero).toBe(true);
    });

    it('should return existing load if already allocated', () => {
      const m = new Member();
      m.getMemberLoad(0).p1 = 42;
      expect(m.getMemberLoad(0).p1).toBe(42);
    });
  });

  describe('getCMQLoad', () => {
    it('should auto-expand cmqLoads array', () => {
      const m = new Member();
      const load = m.getCMQLoad(1);
      expect(m.cmqLoads.length).toBe(2);
      expect(load.isZero).toBe(true);
    });
  });

  describe('setLoadCaseCount', () => {
    it('should expand both memberLoads and cmqLoads', () => {
      const m = new Member();
      m.setLoadCaseCount(4);
      expect(m.memberLoads.length).toBe(4);
      expect(m.cmqLoads.length).toBe(4);
    });

    it('should truncate both arrays when count decreases', () => {
      const m = new Member();
      m.setLoadCaseCount(4);
      m.setLoadCaseCount(2);
      expect(m.memberLoads.length).toBe(2);
      expect(m.cmqLoads.length).toBe(2);
    });
  });

  describe('removeLoad', () => {
    it('should remove from both memberLoads and cmqLoads at index', () => {
      const m = new Member();
      m.setLoadCaseCount(3);
      m.getMemberLoad(1).p1 = 42;
      m.getCMQLoad(1).moy = 7;
      m.removeLoad(0);
      expect(m.memberLoads.length).toBe(2);
      expect(m.memberLoads[0].p1).toBe(42);
      expect(m.cmqLoads[0].moy).toBe(7);
    });
  });
});
