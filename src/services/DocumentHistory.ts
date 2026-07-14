import { FrameDocument } from '../models/FrameDocument';
import { parseFrameJson, writeFrameJson } from '../io/FrameJson';

export interface DocumentHistoryOptions {
  maxEntries?: number;
  /** FrameDocument.notifyChange()を自動記録する。既定true。 */
  trackChanges?: boolean;
}

export interface DocumentHistoryEntry {
  snapshot: string;
  label: string;
  timestamp: number;
}

export interface DocumentAutosavePayload {
  autosaveVersion: 1;
  createdAt: number;
  entries: DocumentHistoryEntry[];
  currentIndex: number;
  savedSnapshot: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** IndexedDB等をラップする非同期ストレージアダプタ。 */
export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class DocumentHistory {
  private readonly document: FrameDocument;
  private readonly maxEntries: number;
  private readonly trackChanges: boolean;
  private entries: DocumentHistoryEntry[];
  private currentIndex = 0;
  private savedSnapshot: string;
  private restoring = false;
  private transactionDepth = 0;
  private transactionLabel = 'Edit';
  private transactionStartSnapshot: string | null = null;
  private readonly changeListener: () => void;

  constructor(document: FrameDocument, options: DocumentHistoryOptions = {}) {
    this.document = document;
    this.maxEntries = Math.max(2, Math.trunc(options.maxEntries ?? 100));
    this.trackChanges = options.trackChanges ?? true;
    const snapshot = writeFrameJson(document);
    this.entries = [{ snapshot, label: 'Initial state', timestamp: Date.now() }];
    this.savedSnapshot = snapshot;
    this.changeListener = () => {
      if (this.restoring || !this.trackChanges) return;
      if (this.transactionDepth > 0) return;
      this.capture('Edit');
    };
    if (this.trackChanges) this.document.onChange(this.changeListener);
  }

  dispose(): void {
    if (this.trackChanges) this.document.removeChangeListener(this.changeListener);
  }

  get canUndo(): boolean {
    return this.currentIndex > 0;
  }

  get canRedo(): boolean {
    return this.currentIndex < this.entries.length - 1;
  }

  get isDirty(): boolean {
    return writeFrameJson(this.document) !== this.savedSnapshot;
  }

  get length(): number {
    return this.entries.length;
  }

  get index(): number {
    return this.currentIndex;
  }

  getEntries(): readonly DocumentHistoryEntry[] {
    return this.entries.map(entry => ({ ...entry }));
  }

  /** 現在状態を履歴へ追加。同一スナップショットは追加しない。 */
  capture(label: string = 'Edit'): boolean {
    const snapshot = writeFrameJson(this.document);
    if (snapshot === this.entries[this.currentIndex]?.snapshot) return false;
    this.entries.splice(this.currentIndex + 1);
    this.entries.push({ snapshot, label, timestamp: Date.now() });
    if (this.entries.length > this.maxEntries) {
      const removeCount = this.entries.length - this.maxEntries;
      this.entries.splice(0, removeCount);
    }
    this.currentIndex = this.entries.length - 1;
    return true;
  }

  beginTransaction(label: string = 'Edit'): void {
    if (this.transactionDepth === 0) {
      this.transactionLabel = label;
      this.transactionStartSnapshot = writeFrameJson(this.document);
    }
    this.transactionDepth++;
  }

  endTransaction(): boolean {
    if (this.transactionDepth <= 0) throw new Error('No document history transaction is active.');
    this.transactionDepth--;
    if (this.transactionDepth !== 0) return false;
    try {
      return this.capture(this.transactionLabel);
    } finally {
      this.transactionStartSnapshot = null;
    }
  }

  runTransaction<T>(label: string, action: () => T): T {
    this.beginTransaction(label);
    try {
      const result = action();
      this.endTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      throw error;
    }
  }

  private rollbackTransaction(): void {
    const snapshot = this.transactionStartSnapshot;
    this.transactionDepth = 0;
    this.transactionStartSnapshot = null;
    if (snapshot == null) return;
    const wasRestoring = this.restoring;
    this.restoring = true;
    try {
      parseFrameJson(snapshot, this.document, { mode: 'strict' });
    } finally {
      this.restoring = wasRestoring;
    }
  }

  private restoreEntry(index: number): boolean {
    const entry = this.entries[index];
    if (!entry) return false;
    this.restoring = true;
    try {
      parseFrameJson(entry.snapshot, this.document, { mode: 'strict' });
      this.currentIndex = index;
    } finally {
      this.restoring = false;
    }
    return true;
  }

  undo(): boolean {
    return this.canUndo && this.restoreEntry(this.currentIndex - 1);
  }

  redo(): boolean {
    return this.canRedo && this.restoreEntry(this.currentIndex + 1);
  }

  markSaved(): void {
    this.savedSnapshot = writeFrameJson(this.document);
  }

  reset(markSaved: boolean = true): void {
    const snapshot = writeFrameJson(this.document);
    this.entries = [{ snapshot, label: 'Initial state', timestamp: Date.now() }];
    this.currentIndex = 0;
    if (markSaved) this.savedSnapshot = snapshot;
  }

  serializeAutosave(): string {
    const payload: DocumentAutosavePayload = {
      autosaveVersion: 1,
      createdAt: Date.now(),
      entries: this.entries.map(entry => ({ ...entry })),
      currentIndex: this.currentIndex,
      savedSnapshot: this.savedSnapshot,
    };
    return JSON.stringify(payload);
  }

  /** 全スナップショットを検査後、ドキュメントと履歴を原子的に復元する。 */
  restoreAutosave(serialized: string): void {
    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch (error) {
      throw new Error(`Invalid autosave JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid autosave payload.');
    const raw = value as Partial<DocumentAutosavePayload>;
    if (raw.autosaveVersion !== 1 || !Array.isArray(raw.entries) || raw.entries.length === 0) {
      throw new Error('Unsupported or empty autosave payload.');
    }
    const entries: DocumentHistoryEntry[] = raw.entries.map((entry, index) => {
      if (!entry || typeof entry.snapshot !== 'string') throw new Error(`Invalid autosave entry ${index}.`);
      const temporary = new FrameDocument();
      parseFrameJson(entry.snapshot, temporary, { mode: 'strict' });
      return {
        snapshot: entry.snapshot,
        label: typeof entry.label === 'string' ? entry.label : 'Recovered edit',
        timestamp: Number.isFinite(entry.timestamp) ? entry.timestamp : Date.now(),
      };
    });
    const currentIndex = Number(raw.currentIndex);
    if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= entries.length) {
      throw new Error('Invalid autosave currentIndex.');
    }
    if (typeof raw.savedSnapshot !== 'string') throw new Error('Invalid autosave savedSnapshot.');
    parseFrameJson(raw.savedSnapshot, new FrameDocument(), { mode: 'strict' });

    this.restoring = true;
    try {
      parseFrameJson(entries[currentIndex].snapshot, this.document, { mode: 'strict' });
      this.entries = entries;
      this.currentIndex = currentIndex;
      this.savedSnapshot = raw.savedSnapshot;
    } finally {
      this.restoring = false;
    }
  }

  saveAutosave(storage: KeyValueStorage, key: string): void {
    storage.setItem(key, this.serializeAutosave());
  }

  restoreAutosaveFrom(storage: KeyValueStorage, key: string): boolean {
    const serialized = storage.getItem(key);
    if (serialized == null) return false;
    this.restoreAutosave(serialized);
    return true;
  }

  clearAutosave(storage: KeyValueStorage, key: string): void {
    storage.removeItem(key);
  }

  async saveAutosaveAsync(storage: AsyncKeyValueStorage, key: string): Promise<void> {
    await storage.setItem(key, this.serializeAutosave());
  }

  async restoreAutosaveFromAsync(storage: AsyncKeyValueStorage, key: string): Promise<boolean> {
    const serialized = await storage.getItem(key);
    if (serialized == null) return false;
    this.restoreAutosave(serialized);
    return true;
  }

  async clearAutosaveAsync(storage: AsyncKeyValueStorage, key: string): Promise<void> {
    await storage.removeItem(key);
  }
}
