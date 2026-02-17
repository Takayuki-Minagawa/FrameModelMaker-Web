import { describe, it, expect } from 'vitest';
import { MemberLoad } from '../../src/models/MemberLoad';

describe('MemberLoad', () => {
  it('should default to isZero=true', () => {
    expect(new MemberLoad().isZero).toBe(true);
  });

  it('should report isZero=false when scale is non-zero', () => {
    const ml = new MemberLoad();
    ml.scale = 1.5;
    expect(ml.isZero).toBe(false);
  });

  it('should report isZero=false when unitLoad is non-zero', () => {
    const ml = new MemberLoad();
    ml.unitLoad = 0.1;
    expect(ml.isZero).toBe(false);
  });

  it('should report isZero=false when p1 is non-zero', () => {
    const ml = new MemberLoad();
    ml.p1 = 10;
    expect(ml.isZero).toBe(false);
  });

  it('should report isZero=false when p2 is non-zero', () => {
    const ml = new MemberLoad();
    ml.p2 = -3;
    expect(ml.isZero).toBe(false);
  });

  it('should report isZero=false when p3 is non-zero', () => {
    const ml = new MemberLoad();
    ml.p3 = 7;
    expect(ml.isZero).toBe(false);
  });
});
