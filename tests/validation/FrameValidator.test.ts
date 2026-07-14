import { describe, expect, it } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { Node } from '../../src/models/Node';
import { Member } from '../../src/models/Member';
import { Spring } from '../../src/models/Spring';
import { validateFrameDocument } from '../../src/validation/FrameValidator';
import { readFileSync } from 'node:fs';
import { parseFrameJson } from '../../src/io/FrameJson';

describe('FrameValidator', () => {
  it('returns structured diagnostics for broken references and reserved springs', () => {
    const doc = new FrameDocument();
    const node = new Node(); node.number = 1; doc.nodes = [node];
    const member = new Member();
    Object.assign(member, { number: 1, iNodeNumber: 1, jNodeNumber: 99, sectionNumber: 42, ixSpring: 8 });
    doc.members = [member];
    const spring = new Spring(); spring.number = 1; doc.springs = [spring];
    const result = validateFrameDocument(doc);
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      'missing_node_reference', 'missing_section_reference', 'missing_spring_reference', 'reserved_spring_collision',
    ]));
    expect(result.diagnostics.find(item => item.code === 'missing_node_reference')?.entity).toMatchObject({ kind: 'member', number: 1 });
  });

  it('detects load array and boundary-reference mismatches', () => {
    const doc = new FrameDocument();
    const node = new Node(); node.number = 1; node.loads = []; doc.nodes = [node];
    const result = validateFrameDocument(doc);
    expect(result.diagnostics.map(item => item.code)).toContain('load_case_array_mismatch');
  });

  it('migrates the bundled legacy sample without validation errors', () => {
    const doc = new FrameDocument();
    parseFrameJson(readFileSync('public/samples/FrameModel_Sample.json', 'utf8'), doc);
    expect(validateFrameDocument(doc).errorCount).toBe(0);
  });
});
