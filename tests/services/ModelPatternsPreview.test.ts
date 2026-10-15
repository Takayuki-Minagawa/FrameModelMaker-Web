import { describe, expect, it } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Section } from '../../src/models/Section';
import { generateFrame, previewPattern, replicatePattern, validatePattern } from '../../src/services/ModelPatterns';
import { writeFrameJson } from '../../src/io/FrameJson';

function model() {
  const doc = new FrameDocument();
  const section = new Section();
  section.number = 1;
  doc.sections.push(section);
  generateFrame(doc, { kind: 'frame', spans: 1, stories: 1, span: 100, height: 200, sectionNumber: 1 });
  return doc;
}

describe('previewPattern (R11)', () => {
  it('reports counts, source numbers and first-copy coordinates without mutating the model', () => {
    const doc = model();
    const before = writeFrameJson(doc);
    const preview = previewPattern(
      doc,
      { nodes: [], members: doc.members.map((member) => member.number), walls: [] },
      { kind: 'linear', count: 3, delta: [12.5, 0, 0] },
    );
    expect(writeFrameJson(doc)).toBe(before);
    expect(preview.copies).toBe(3);
    expect(preview.sourceNodeNumbers).toHaveLength(4);
    expect(preview.sourceMemberNumbers).toHaveLength(3);
    expect(preview.addedNodeCount).toBe(12);
    expect(preview.addedMemberCount).toBe(9);
    expect(preview.addedWallCount).toBe(0);
    const first = preview.firstCopyPositions.find((item) => item.sourceNodeNumber === doc.nodes[0].number)!;
    expect(first.position).toEqual([doc.nodes[0].x + 12.5, doc.nodes[0].y, doc.nodes[0].z]);

    const replicated = replicatePattern(
      doc,
      { nodes: [], members: doc.members.map((member) => member.number), walls: [] },
      { kind: 'linear', count: 3, delta: [12.5, 0, 0] },
    );
    expect(replicated.nodes).toHaveLength(preview.addedNodeCount);
    expect(replicated.members).toHaveLength(preview.addedMemberCount);
  });

  it('previews mirror and radial transforms and validates counts', () => {
    const doc = model();
    const mirror = previewPattern(doc, { nodes: [doc.nodes[1].number], members: [], walls: [] }, { kind: 'mirror', axis: 'x', offset: 0 });
    expect(mirror.copies).toBe(1);
    expect(mirror.firstCopyPositions[0].position[0]).toBeCloseTo(-doc.nodes[1].x);
    const radial = previewPattern(doc, { nodes: [doc.nodes[1].number], members: [], walls: [] }, { kind: 'radial', count: 1, axis: 'z', angleDegrees: 90, origin: [0, 0, 0] });
    expect(radial.firstCopyPositions[0].position[1]).toBeCloseTo(doc.nodes[1].x);
    expect(() => validatePattern({ kind: 'linear', count: 0, delta: [1, 0, 0] })).toThrow('1–1000');
    expect(() => validatePattern({ kind: 'linear', count: 1, delta: [Number.NaN, 0, 0] })).toThrow('finite');
    expect(() => previewPattern(doc, { nodes: [999], members: [], walls: [] }, { kind: 'linear', count: 1, delta: [1, 0, 0] })).toThrow('selection');
  });
});
