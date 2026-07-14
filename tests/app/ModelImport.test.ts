import { describe, expect, it } from 'vitest';
import { parseUserFrameJson } from '../../src/app/ModelImport';
import { writeFrameJson } from '../../src/io/FrameJson';
import { FrameDocument } from '../../src/models/FrameDocument';

describe('parseUserFrameJson', () => {
  it('uses strict parsing for application-generated JSON', () => {
    const source = new FrameDocument();
    source.addNode(source.createNode(100, 0, 0));
    const target = new FrameDocument();

    const result = parseUserFrameJson(writeFrameJson(source), target);

    expect(target.nodes[0].x).toBe(100);
    expect(result.diagnostics.some(item => item.code === 'lenient_import_fallback')).toBe(false);
  });

  it('falls back to compatibility parsing with a visible diagnostic', () => {
    const raw = JSON.parse(writeFrameJson(new FrameDocument())) as Record<string, unknown>;
    raw.nodes = [{ number: 1, x: '100', y: 0, z: 0, loads: [] }];
    const target = new FrameDocument();

    const result = parseUserFrameJson(JSON.stringify(raw), target);

    expect(target.nodes[0].x).toBe(100);
    expect(result.diagnostics.map(item => item.code)).toContain('lenient_import_fallback');
    expect(result.diagnostics.map(item => item.code)).toContain('coerced_number');
  });

  it('still rejects malformed JSON without replacing the target', () => {
    const target = new FrameDocument();
    target.title = 'keep';

    expect(() => parseUserFrameJson('{', target)).toThrow('Invalid JSON');
    expect(target.title).toBe('keep');
  });
});
