import { describe, expect, it } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Node } from '../../src/models/Node';
import { Section } from '../../src/models/Section';
import { CURRENT_FRAME_JSON_FORMAT_VERSION, migrateFrameJson, parseFrameJson, writeFrameJson } from '../../src/io/FrameJson';

describe('FrameJson versioning', () => {
  it('migrates an unversioned document and writes the current version', () => {
    const doc = new FrameDocument();
    const result = parseFrameJson(JSON.stringify({ title: 'old', loadCaseCount: 2, nodes: [], members: [], sections: [] }), doc);
    expect(result.migratedFrom).toBe(1);
    expect(doc.loadCases.map(item => item.id)).toEqual(['LC1', 'LC2']);
    expect(JSON.parse(writeFrameJson(doc)).formatVersion).toBe(CURRENT_FRAME_JSON_FORMAT_VERSION);
    const current = migrateFrameJson(JSON.parse(writeFrameJson(doc)));
    expect(current.migratedFrom).toBeUndefined();
  });

  it('rejects future versions and strict invalid values without mutating the target', () => {
    const doc = new FrameDocument(); doc.title = 'unchanged';
    expect(() => parseFrameJson('{"formatVersion":99}', doc)).toThrow('future');
    expect(doc.title).toBe('unchanged');
    expect(() => parseFrameJson(JSON.stringify({
      formatVersion: 2, title: 'bad', loadCaseCount: 1,
      nodes: [{ number: 1, x: 'not-number' }], loadCases: [{ id: 'LC1', name: 'Case' }],
    }), doc, { mode: 'strict' })).toThrow('finite number');
    expect(doc.title).toBe('unchanged');
  });

  it('does not coerce scalar rows, numeric strings, or fractional integers in strict mode', () => {
    const target = new FrameDocument();
    target.title = 'unchanged';
    const parseStrict = (nodes: unknown[]): void => {
      parseFrameJson(JSON.stringify({ formatVersion: 2, title: 'replacement', nodes }), target, { mode: 'strict' });
    };

    expect(() => parseStrict([null])).toThrow('$.nodes[0] must be an object');
    expect(() => parseStrict([{ number: 1, x: '12' }])).toThrow('$.nodes[0].x must be a finite number');
    expect(() => parseStrict([{ number: 1.9 }])).toThrow('$.nodes[0].number must be an integer');
    expect(target.title).toBe('unchanged');
  });

  it('round-trips named cases, combinations and analysis metadata', () => {
    const doc = new FrameDocument();
    const node = new Node(); node.number = 1; doc.nodes = [node];
    doc.addLoadCase({ id: 'LIVE', name: 'Live' });
    doc.addLoadCombination('ULS', [{ loadCaseId: 'LC1', factor: 1.2 }, { loadCaseId: 'LIVE', factor: 1.6 }]);
    doc.analysisMetadata = {
      sourceFormat: 'analysis-yaml', schemaVersion: '1', units: {}, constraints: [], nodalMasses: [],
      linkElements: [], localAxes: {}, groups: [], extensions: { custom: { answer: 42 } },
    };
    const restored = new FrameDocument();
    parseFrameJson(writeFrameJson(doc), restored, { mode: 'strict' });
    expect(restored.loadCases[1]).toMatchObject({ id: 'LIVE', name: 'Live' });
    expect(restored.loadCombinations[0].terms).toHaveLength(2);
    expect(restored.analysisMetadata?.extensions).toEqual({ custom: { answer: 42 } });
  });

  it('treats omitted v1 boundary degrees of freedom as free', () => {
    const doc = new FrameDocument();
    parseFrameJson(JSON.stringify({
      boundaries: [{ nodeNumber: 1, deltaX: -1 }],
    }), doc, { mode: 'strict' });

    expect(doc.boundaries[0]).toMatchObject({
      nodeNumber: 1,
      deltaX: 1,
      deltaY: 0,
      deltaZ: 0,
      thetaX: 0,
      thetaY: 0,
      thetaZ: 0,
    });
  });

  it('preserves an explicit zero torsion constant independently from legacy p2_Ix', () => {
    const doc = new FrameDocument();
    const section = new Section();
    section.number = 1;
    section.p2_Ix = 12;
    section.torsionConstant = 0;
    doc.sections = [section];

    const serialized = writeFrameJson(doc);
    expect(JSON.parse(serialized).sections[0].torsionConstant).toBe(0);

    const restored = new FrameDocument();
    parseFrameJson(serialized, restored, { mode: 'strict' });
    expect(restored.sections[0].torsionConstant).toBe(0);
    expect(restored.sections[0].p2_Ix).toBe(12);
  });

  it('normalizes analysis metadata collections and rejects malformed structures atomically', () => {
    const normalized = new FrameDocument();
    parseFrameJson(JSON.stringify({
      formatVersion: 2,
      analysisMetadata: {},
    }), normalized, { mode: 'strict' });
    expect(normalized.analysisMetadata).toMatchObject({
      sourceFormat: '',
      schemaVersion: '',
      units: {},
      constraints: [],
      nodalMasses: [],
      linkElements: [],
      localAxes: {},
      groups: [],
    });

    const target = new FrameDocument();
    target.title = 'unchanged';
    expect(() => parseFrameJson(JSON.stringify({
      formatVersion: 2,
      title: 'invalid replacement',
      analysisMetadata: { constraints: {} },
    }), target, { mode: 'strict' })).toThrow('analysisMetadata.constraints must be array');
    expect(target.title).toBe('unchanged');
  });
});
