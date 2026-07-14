import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { DocumentHistory, type KeyValueStorage } from '../../src/services/DocumentHistory';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function addNode(document: FrameDocument, x: number): void {
  document.addNode(document.createNode(x, 0, 0));
}

describe('DocumentHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks document notifications and restores complete snapshots with undo/redo', () => {
    const document = new FrameDocument();
    const history = new DocumentHistory(document);

    addNode(document, 10);
    expect(history.length).toBe(2);
    expect(history.index).toBe(1);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.isDirty).toBe(true);

    expect(history.undo()).toBe(true);
    expect(document.nodes).toHaveLength(0);
    expect(history.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    expect(history.redo()).toBe(true);
    expect(document.nodes).toHaveLength(1);
    expect(document.nodes[0].x).toBe(10);
    expect(history.redo()).toBe(false);

    history.dispose();
  });

  it('drops the redo branch when a new edit is captured after undo', () => {
    const document = new FrameDocument();
    const history = new DocumentHistory(document);
    addNode(document, 10);
    addNode(document, 20);

    expect(history.undo()).toBe(true);
    expect(document.nodes.map(node => node.x)).toEqual([10]);
    addNode(document, 30);

    expect(history.canRedo).toBe(false);
    expect(history.getEntries()).toHaveLength(3);
    expect(document.nodes.map(node => node.x)).toEqual([10, 30]);
  });

  it('coalesces nested notifications into one labeled transaction entry', () => {
    const document = new FrameDocument();
    const history = new DocumentHistory(document);

    history.runTransaction('Add floor', () => {
      addNode(document, 0);
      history.runTransaction('Nested label is ignored', () => addNode(document, 100));
      addNode(document, 200);
    });

    expect(history.length).toBe(2);
    expect(history.getEntries()[1].label).toBe('Add floor');
    expect(document.nodes).toHaveLength(3);
    history.undo();
    expect(document.nodes).toHaveLength(0);
  });

  it('rolls back a failed transaction without appending history', () => {
    const document = new FrameDocument();
    document.title = 'Before';
    const history = new DocumentHistory(document);

    expect(() => history.runTransaction('Failed edit', () => {
      document.title = 'During';
      addNode(document, 10);
      throw new Error('stop');
    })).toThrow('stop');

    expect(document.title).toBe('Before');
    expect(document.nodes).toHaveLength(0);
    expect(history.length).toBe(1);
    expect(history.index).toBe(0);
    expect(history.isDirty).toBe(false);

    history.runTransaction('Next edit', () => addNode(document, 20));
    expect(document.nodes.map(node => node.x)).toEqual([20]);
    expect(history.length).toBe(2);
  });

  it('rolls back to the outer snapshot when a nested transaction fails', () => {
    const document = new FrameDocument();
    const history = new DocumentHistory(document);

    expect(() => history.runTransaction('Outer edit', () => {
      addNode(document, 10);
      history.runTransaction('Inner edit', () => {
        addNode(document, 20);
        throw new Error('nested failure');
      });
    })).toThrow('nested failure');

    expect(document.nodes).toHaveLength(0);
    expect(history.length).toBe(1);
    expect(history.isDirty).toBe(false);
  });

  it('rejects an unmatched transaction end', () => {
    const history = new DocumentHistory(new FrameDocument());
    expect(() => history.endTransaction()).toThrow('No document history transaction is active.');
  });

  it('does not append duplicate snapshots and enforces the configured history limit', () => {
    const document = new FrameDocument();
    const history = new DocumentHistory(document, { maxEntries: 3, trackChanges: false });

    expect(history.capture('No change')).toBe(false);
    for (const x of [10, 20, 30, 40]) {
      document.nodes.push(document.createNode(x, 0, 0));
      expect(history.capture(`Node ${x}`)).toBe(true);
    }

    expect(history.length).toBe(3);
    expect(history.index).toBe(2);
    expect(history.getEntries().map(entry => entry.label)).toEqual(['Node 20', 'Node 30', 'Node 40']);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
  });

  it('marks the current snapshot saved and can reset without changing the saved baseline', () => {
    const document = new FrameDocument();
    const history = new DocumentHistory(document);
    addNode(document, 10);
    expect(history.isDirty).toBe(true);

    history.markSaved();
    expect(history.isDirty).toBe(false);
    addNode(document, 20);
    expect(history.isDirty).toBe(true);

    history.reset(false);
    expect(history.length).toBe(1);
    expect(history.canUndo).toBe(false);
    expect(history.isDirty).toBe(true);
    history.reset();
    expect(history.isDirty).toBe(false);
  });

  it('treats the active load case as view state and preserves it across undo', () => {
    const document = new FrameDocument();
    document.addLoadCase({ id: 'LC2', name: 'Second' });
    const history = new DocumentHistory(document);

    document.loadCaseIndex = 1;

    expect(history.isDirty).toBe(false);
    expect(history.capture('Change active load case')).toBe(false);
    expect(history.length).toBe(1);

    addNode(document, 10);
    expect(history.isDirty).toBe(true);
    expect(history.undo()).toBe(true);
    expect(document.loadCaseIndex).toBe(1);
    expect(history.isDirty).toBe(false);
  });

  it('round-trips history, current position, and dirty baseline through autosave storage', () => {
    const source = new FrameDocument();
    source.title = 'Recovered model';
    const sourceHistory = new DocumentHistory(source);
    addNode(source, 10);
    sourceHistory.markSaved();
    addNode(source, 20);
    sourceHistory.undo();

    const storage = new MemoryStorage();
    sourceHistory.saveAutosave(storage, 'frame-autosave');

    const recovered = new FrameDocument();
    const recoveredHistory = new DocumentHistory(recovered);
    expect(recoveredHistory.restoreAutosaveFrom(storage, 'frame-autosave')).toBe(true);

    expect(recovered.title).toBe('Recovered model');
    expect(recovered.nodes.map(node => node.x)).toEqual([10]);
    expect(recoveredHistory.length).toBe(3);
    expect(recoveredHistory.index).toBe(1);
    expect(recoveredHistory.canUndo).toBe(true);
    expect(recoveredHistory.canRedo).toBe(true);
    expect(recoveredHistory.isDirty).toBe(false);

    recoveredHistory.redo();
    expect(recovered.nodes.map(node => node.x)).toEqual([10, 20]);
    expect(recoveredHistory.isDirty).toBe(true);

    recoveredHistory.clearAutosave(storage, 'frame-autosave');
    expect(recoveredHistory.restoreAutosaveFrom(storage, 'frame-autosave')).toBe(false);
  });

  it.each([
    ['malformed JSON', '{'],
    ['unsupported version', JSON.stringify({ autosaveVersion: 2, entries: [] })],
    ['empty entries', JSON.stringify({ autosaveVersion: 1, entries: [] })],
    ['bad current index', JSON.stringify({
      autosaveVersion: 1,
      entries: [{ snapshot: '{}', label: 'bad', timestamp: 0 }],
      currentIndex: 3,
      savedSnapshot: '{}',
    })],
  ])('rejects %s without replacing the live document', (_label, serialized) => {
    const document = new FrameDocument();
    document.title = 'Keep me';
    addNode(document, 99);
    const history = new DocumentHistory(document);

    expect(() => history.restoreAutosave(serialized)).toThrow();
    expect(document.title).toBe('Keep me');
    expect(document.nodes.map(node => node.x)).toEqual([99]);
  });

  it('stops observing changes after dispose', () => {
    const document = new FrameDocument();
    const history = new DocumentHistory(document);
    history.dispose();
    addNode(document, 10);
    expect(history.length).toBe(1);
  });
});
