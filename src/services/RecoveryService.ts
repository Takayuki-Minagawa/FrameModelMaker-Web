import { FrameDocument } from '../models/FrameDocument';
import type { KeyValueStorage } from './DocumentHistory';
import { DocumentHistory } from './DocumentHistory';
import { RecoveryRepository, type RecoveryRecord } from './RecoveryRepository';

export type RecoveryStatus = { state: 'idle' | 'saving' | 'saved' | 'failed'; time?: number; error?: string };
export const LEGACY_RECOVERY_KEY = 'framemodelmaker.autosave.v1';

export class RecoveryService {
  readonly sessionId = crypto.randomUUID();
  private modelId = crypto.randomUUID();
  private revision = 0;
  private queue: Promise<void> = Promise.resolve();
  private generation = 0;
  status: RecoveryStatus = { state: 'idle' };
  onStatus: (status: RecoveryStatus) => void = () => {};

  constructor(readonly repository = new RecoveryRepository()) {}

  newModel(): void {
    this.modelId = crypto.randomUUID();
    this.revision = 0;
    this.generation++;
    this.update({ state: 'idle' });
  }

  private update(status: RecoveryStatus): void {
    this.status = status;
    this.onStatus(status);
  }

  async save(history: DocumentHistory, title: string): Promise<void> {
    const generation = this.generation;
    const record: RecoveryRecord = {
      version: 1,
      id: `${this.sessionId}:${this.modelId}`,
      modelId: this.modelId,
      sessionId: this.sessionId,
      revision: ++this.revision,
      updatedAt: Date.now(),
      title,
      payload: history.serializeAutosave(),
    };
    this.update({ state: 'saving' });
    const task = this.queue.catch(() => {}).then(() => this.repository.save(record));
    this.queue = task;
    return task.then(
      () => {
        if (generation === this.generation && record.revision === this.revision)
          this.update({ state: 'saved', time: record.updatedAt });
      },
      (error) => {
        if (generation === this.generation && record.revision === this.revision) {
          this.update({ state: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
        throw error;
      },
    );
  }

  async remove(id: string): Promise<void> {
    await this.queue.catch(() => {});
    await this.repository.remove(id);
  }

  async migrateLegacy(storage: KeyValueStorage): Promise<boolean> {
    const payload = storage.getItem(LEGACY_RECOVERY_KEY);
    if (!payload) return false;
    const doc = new FrameDocument();
    const history = new DocumentHistory(doc, { trackChanges: false });
    history.restoreAutosave(payload);
    // A deterministic key makes retrying a failed legacy removal idempotent.
    await this.repository.save({
      version: 1,
      id: 'legacy',
      sessionId: 'legacy',
      modelId: 'legacy',
      revision: 0,
      updatedAt: Date.now(),
      title: doc.title,
      payload: history.serializeAutosave(),
    });
    storage.removeItem(LEGACY_RECOVERY_KEY);
    return true;
  }
}
