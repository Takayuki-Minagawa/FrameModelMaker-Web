import { describe, it, expect } from 'vitest';
import { SectionType, SectionShape, Section } from '../../src/models/Section';

describe('SectionType enum', () => {
  it('should have expected values', () => {
    expect(SectionType.Horizontal).toBe(0);
    expect(SectionType.Vertical).toBe(1);
    expect(SectionType.Diagonal).toBe(2);
    expect(SectionType.Other).toBe(3);
    expect(SectionType.Truss).toBe(4);
    expect(SectionType.Wall).toBe(5);
  });
});

describe('SectionShape enum', () => {
  it('should have expected values', () => {
    expect(SectionShape.DirectInput).toBe(0);
    expect(SectionShape.Rectangle).toBe(1);
    expect(SectionShape.Circle).toBe(2);
    expect(SectionShape.Steel).toBe(3);
    expect(SectionShape.Box).toBe(4);
    expect(SectionShape.I_Steel).toBe(5);
    expect(SectionShape.H_Steel).toBe(6);
  });
});

describe('Section', () => {
  it('should default all fields to zero/empty', () => {
    const s = new Section();
    expect(s.number).toBe(0);
    expect(s.materialNumber).toBe(0);
    expect(s.type).toBe(SectionType.Horizontal);
    expect(s.shape).toBe(SectionShape.DirectInput);
    expect(s.p1_A).toBe(0);
    expect(s.comment).toBe('');
  });
});
