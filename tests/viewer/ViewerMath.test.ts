import { describe, expect, it } from 'vitest';
import {
  calculateBounds,
  colorForKey,
  pointInPolygon,
  pointToSegmentDistanceSq,
  snapPoint,
  thinLabelCandidates,
} from '../../src/viewer/ViewerMath';

describe('ViewerMath', () => {
  it('calculates bounds while ignoring invalid coordinates', () => {
    expect(calculateBounds([
      { x: -2, y: 4, z: 8 },
      { x: 10, y: -6, z: 2 },
      { x: Number.NaN, y: 0, z: 0 },
    ])).toEqual({
      min: [-2, -6, 2],
      max: [10, 4, 8],
      center: [4, -1, 5],
      size: [12, 10, 6],
      maxDimension: 12,
    });
    expect(calculateBounds([])).toBeNull();
  });

  it('snaps only axes unlocked by the active drawing plane', () => {
    expect(snapPoint([12, 37, 63], 25, [0, 2])).toEqual([0, 37, 75]);
    expect(snapPoint([12, 37, 63], 0, [0, 1, 2])).toEqual([12, 37, 63]);
  });

  it('thins dense labels deterministically and prioritizes selected labels', () => {
    const result = thinLabelCandidates([
      { value: 'ordinary-a', x: 10, y: 10, priority: 1 },
      { value: 'selected', x: 11, y: 11, priority: 100 },
      { value: 'ordinary-b', x: 100, y: 100, priority: 1 },
      { value: 'outside-limit', x: 200, y: 200, priority: 1 },
    ], 2, 20);
    expect(result.map(item => item.value)).toEqual(['selected', 'ordinary-b']);
  });

  it('supports wall polygon and member screen-space hit testing', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 20, y: 5 }, square)).toBe(false);
    expect(pointToSegmentDistanceSq(5, 3, 0, 0, 10, 0)).toBe(9);
  });

  it('assigns stable distinct palette colors', () => {
    expect(colorForKey('section:1')).toBe(colorForKey('section:1'));
    expect(colorForKey('section:1')).not.toBe(colorForKey('section:2'));
    expect(colorForKey('section:1')).toMatch(/^hsl\(/);
  });
});
