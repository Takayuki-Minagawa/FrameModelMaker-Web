import { describe, expect, it } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { DocumentHistory } from '../../src/services/DocumentHistory';
import { EditorController } from '../../src/app/EditorController';

describe('EditorController', () => {
  it('records a command once and rolls back failed mutations', () => {
    const doc = new FrameDocument();
    const history = new DocumentHistory(doc, { trustChangeNotifications: true });
    const editor = new EditorController(doc, history);
    let events = 0; doc.onChange(() => events++);
    editor.execute('Add nodes', () => { doc.addNode(); doc.addNode(); });
    expect(events).toBe(1);
    expect(history.length).toBe(2);
    expect(() => editor.execute('Fail', () => { doc.nodes[0].x = 99; throw new Error('Fail'); })).toThrow();
    expect(doc.nodes[0].x).toBe(0);
    history.undo();
    expect(doc.nodes).toHaveLength(0);
    expect(history.isDirty).toBe(false);
  });

  it('captures the state before an already-applied cell edit', () => {
    const doc = new FrameDocument(); const node = doc.addNode();
    const history = new DocumentHistory(doc);
    const editor = new EditorController(doc, history);
    node.x = 42;
    const cell = { rowIndex: 0, columnKey: 'x' as const, previousValue: 0, value: 42, row: node };
    editor.commitGrid({ source: 'edit', ...cell, changes: [cell] });
    expect(doc.nodes[0].x).toBe(42);
    history.undo();
    expect(doc.nodes[0].x).toBe(0);
  });
});
