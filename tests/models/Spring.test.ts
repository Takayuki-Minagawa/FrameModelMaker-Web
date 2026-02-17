import { describe, it, expect } from 'vitest';
import { Spring } from '../../src/models/Spring';

describe('Spring', () => {
  it('RIGID should have number=1', () => {
    expect(Spring.RIGID.number).toBe(1);
  });

  it('PIN should have number=2', () => {
    expect(Spring.PIN.number).toBe(2);
  });

  it('RIGID.isDefault should be true', () => {
    expect(Spring.RIGID.isDefault).toBe(true);
  });

  it('PIN.isDefault should be true', () => {
    expect(Spring.PIN.isDefault).toBe(true);
  });

  it('custom spring should not be default', () => {
    const s = new Spring();
    s.number = 5;
    expect(s.isDefault).toBe(false);
  });

  it('DEFAULT_SPRING_COUNT should be 3', () => {
    expect(Spring.DEFAULT_SPRING_COUNT).toBe(3);
  });
});
