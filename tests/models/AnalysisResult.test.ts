import { describe, expect, it } from 'vitest';
import { parseAnalysisResult } from '../../src/models/AnalysisResult';

describe('AnalysisResult', () => {
  const conventions = {
    units: { length: 'cm', force: 'kN', moment: 'kN-cm', time: 's' },
    coordinateSystem: 'global-xyz',
    nodeReactionSystem: 'global-xyz',
    memberForceSystem: 'local-xyz',
  };

  it('parses static and time-history result frames', () => {
    const staticResult = parseAnalysisResult(JSON.stringify({
      ...conventions,
      title: 'static', nodes: [{ node: 1, displacement: [1, 2, 3], rotation: [0, 0, 0], reaction: [1, 2, 3, 4, 5, 6] }],
      members: [{ member: 2, i: [1, 2, 3, 4, 5, 6], j: [6, 5, 4, 3, 2, 1] }],
    }));
    expect(staticResult.frames[0].nodes[0].displacement.y).toBe(2);
    expect(staticResult.frames[0].members[0].jEnd.axial).toBe(6);
    const history = parseAnalysisResult(JSON.stringify({ ...conventions, formatVersion: 1, frames: [{ time: 2 }, { time: 1 }] }));
    expect(history.frames.map(frame => frame.time)).toEqual([1, 2]);
    expect(history.units).toEqual({ length: 'cm', force: 'kN', moment: 'kN-cm', time: 's' });
  });

  it('rejects missing or incompatible unit and coordinate conventions', () => {
    expect(() => parseAnalysisResult(JSON.stringify({ formatVersion: 1, frames: [{}] })))
      .toThrow('units.length must be "cm"');
    expect(() => parseAnalysisResult(JSON.stringify({
      ...conventions,
      units: { ...conventions.units, length: 'mm' },
      frames: [{}],
    }))).toThrow('units.length must be "cm"');
    expect(() => parseAnalysisResult(JSON.stringify({
      ...conventions,
      memberForceSystem: 'global-xyz',
      frames: [{}],
    }))).toThrow('memberForceSystem must be "local-xyz"');
  });

  it('does not coerce numeric strings or fractional entity numbers', () => {
    expect(() => parseAnalysisResult(JSON.stringify({
      ...conventions,
      nodes: [{ node: 1, displacement: ['1', 0, 0] }],
    }))).toThrow('displacement.x must be a finite number');
    expect(() => parseAnalysisResult(JSON.stringify({
      ...conventions,
      nodes: [{ node: 1.5 }],
    }))).toThrow('nodeNumber must be a positive integer');
  });

  it('rejects malformed frame collections and duplicate result entities', () => {
    expect(() => parseAnalysisResult(JSON.stringify({ ...conventions, frames: {} })))
      .toThrow('frames must be an array');
    expect(() => parseAnalysisResult(JSON.stringify({
      ...conventions,
      frames: [{ nodes: [{ node: 1 }, { node: 1 }] }],
    }))).toThrow('duplicates node 1');
    expect(() => parseAnalysisResult(JSON.stringify({
      ...conventions,
      nodes: [{ node: 1, displacement: [0, 0] }],
    }))).toThrow('exactly three values');
  });
});
