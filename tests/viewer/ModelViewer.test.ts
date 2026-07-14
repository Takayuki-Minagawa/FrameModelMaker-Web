import { describe, expect, it } from 'vitest';
import { clientPointToViewport, hasDrawableMemberSpan } from '../../src/viewer/ModelViewer';

describe('ModelViewer geometry helpers', () => {
  it('normalizes client coordinates to logical viewport pixels on HiDPI canvases', () => {
    const rect = { left: 100, top: 50, width: 800, height: 600 };

    expect(clientPointToViewport(500, 350, rect, 400, 300)).toEqual({ x: 200, y: 150 });
    expect(clientPointToViewport(99, 350, rect, 400, 300)).toBeNull();
    expect(clientPointToViewport(500, 651, rect, 400, 300)).toBeNull();
  });

  it('rejects zero-length and non-finite member spans before normalizing them', () => {
    const origin = { x: 0, y: 0, z: 0 };

    expect(hasDrawableMemberSpan(origin, origin)).toBe(false);
    expect(hasDrawableMemberSpan(origin, { x: 1e-7, y: 0, z: 0 })).toBe(false);
    expect(hasDrawableMemberSpan(origin, { x: Number.NaN, y: 0, z: 0 })).toBe(false);
    expect(hasDrawableMemberSpan(origin, { x: 10, y: 0, z: 0 })).toBe(true);
  });
});
