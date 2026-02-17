import { describe, it, expect } from 'vitest';
import { NodeLoad } from '../../src/models/NodeLoad';

describe('NodeLoad', () => {
  it('should default to all zeros', () => {
    const load = new NodeLoad();
    expect(load.p1).toBe(0);
    expect(load.p2).toBe(0);
    expect(load.p3).toBe(0);
    expect(load.m1).toBe(0);
    expect(load.m2).toBe(0);
    expect(load.m3).toBe(0);
  });

  it('should report isZero=true when all values are zero', () => {
    expect(new NodeLoad().isZero).toBe(true);
  });

  it('should report isZero=false when a force is non-zero', () => {
    const load = new NodeLoad();
    load.p1 = 1;
    expect(load.isZero).toBe(false);
  });

  it('should report isZero=false when a moment is non-zero', () => {
    const load = new NodeLoad();
    load.m3 = -5;
    expect(load.isZero).toBe(false);
  });
});
