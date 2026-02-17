import { describe, it, expect } from 'vitest';
import { CMQLoad } from '../../src/models/CMQLoad';

describe('CMQLoad', () => {
  it('should default to isZero=true', () => {
    expect(new CMQLoad().isZero).toBe(true);
  });

  it('should report isZero=false when moy is non-zero', () => {
    const cl = new CMQLoad();
    cl.moy = 1;
    expect(cl.isZero).toBe(false);
  });

  it('should report isZero=false when jQz is non-zero', () => {
    const cl = new CMQLoad();
    cl.jQz = 3.14;
    expect(cl.isZero).toBe(false);
  });

  it('should report isZero=false when iQx is non-zero', () => {
    const cl = new CMQLoad();
    cl.iQx = -0.5;
    expect(cl.isZero).toBe(false);
  });
});
