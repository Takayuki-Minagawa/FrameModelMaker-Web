import { describe, expect, it } from 'vitest';
import {
  frameExtremes,
  frameIndexForTime,
  memberResultRow,
  nodeResultRow,
  RESULT_CSV_COLUMNS,
  resultFrameToCsv,
} from '../../src/services/ResultTables';
import type { AnalysisResultSet } from '../../src/viewer/ViewerTypes';

const results: AnalysisResultSet = {
  name: 'Cantilever',
  frames: [
    {
      time: 0,
      nodes: [
        { nodeNumber: 1, displacement: [0, 0, 0], rotation: [0, 0, 0], reaction: [0, 0, 1], reactionMoment: [0, 100, 0] },
        { nodeNumber: 2, displacement: [0, 0, -0.5], rotation: [0, -0.005, 0] },
      ],
      members: [
        {
          memberNumber: 1,
          stations: [
            { position: 0, axial: 0, shearZ: 1, momentY: 100 },
            { position: 0.5, axial: 0, shearZ: 1, momentY: 50 },
            { position: 1, axial: 0, shearZ: 1, momentY: 0 },
          ],
        },
      ],
    },
    {
      time: 1.5,
      nodes: [
        { nodeNumber: 1, displacement: [0, 0, 0], rotation: [0, 0, 0] },
        { nodeNumber: 2, displacement: [0, 0, -1], rotation: [0, -0.01, 0] },
      ],
      members: [{ memberNumber: 1, stations: [{ position: 0, momentY: 200 }, { position: 1, momentY: 0 }] }],
    },
  ],
};

describe('ResultTables (R15)', () => {
  it('extracts node and member rows for a selection', () => {
    expect(nodeResultRow(results.frames[0], 2)).toEqual({
      nodeNumber: 2,
      displacement: [0, 0, -0.5],
      rotation: [0, -0.005, 0],
      reaction: undefined,
      reactionMoment: undefined,
    });
    expect(nodeResultRow(results.frames[0], 9)).toBeNull();
    expect(memberResultRow(results.frames[0], 1)!.stations.map((station) => station.position)).toEqual([0, 0.5, 1]);
    expect(memberResultRow(results.frames[0], 2)).toBeNull();
  });

  it('finds extremes with their locations', () => {
    const extremes = frameExtremes(results.frames[0]);
    const dz = extremes.find((entry) => entry.key === 'dz')!;
    expect(dz.min).toEqual({ value: -0.5, nodeNumber: 2 });
    expect(dz.max).toEqual({ value: 0, nodeNumber: 1 });
    expect(dz.unit).toBe('cm');
    const momentY = extremes.find((entry) => entry.key === 'momentY')!;
    expect(momentY.max).toEqual({ value: 100, memberNumber: 1, position: 0 });
    expect(momentY.min).toEqual({ value: 0, memberNumber: 1, position: 1 });
    expect(momentY.unit).toBe('kN·cm');
    expect(extremes.find((entry) => entry.key === 'Rz')!.max).toEqual({ value: 1, nodeNumber: 1 });
    expect(extremes.some((entry) => entry.key === 'shearY')).toBe(false);
  });

  it('writes unit-suffixed CSV for one frame and maps times to frames', () => {
    const csv = resultFrameToCsv(results, 1);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toContain('frame 2/2');
    expect(lines[0]).toContain('time 1.5 s');
    expect(lines[1]).toBe(RESULT_CSV_COLUMNS.join(','));
    expect(lines[2]).toBe('node,1,,0,0,0,0,0,0,,,,,,,,,,,,');
    expect(lines[3]).toBe('node,2,,0,0,-1,0,-0.01,0,,,,,,,,,,,,');
    expect(lines[4]).toBe('member,1,0,,,,,,,,,,,,,,,,,200,');
    expect(() => resultFrameToCsv(results, 5)).toThrow();
    expect(frameIndexForTime(results, 1.2)).toBe(1);
    expect(frameIndexForTime(results, 0.4)).toBe(0);
  });
});
