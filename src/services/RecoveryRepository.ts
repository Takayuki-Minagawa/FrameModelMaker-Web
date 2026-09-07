export interface RecoveryRecord {
  version: 1;
  id: string;
  modelId: string;
  sessionId: string;
  revision: number;
  updatedAt: number;
  title: string;
  payload: string;
}

export class RecoveryRepository {
  constructor(private readonly databaseName = 'framemodelmaker-recovery') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'id' });
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('Recovery database is blocked by another tab.'));
      };
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
    });
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction('snapshots', mode);
        const request = action(transaction.objectStore('snapshots'));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error ?? request.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Recovery transaction aborted.'));
      });
    } finally {
      db.close();
    }
  }

  async list(): Promise<RecoveryRecord[]> {
    const records = await this.transaction('readonly', (store) => store.getAll());
    return (records as RecoveryRecord[])
      .filter(
        (record) =>
          record?.version === 1 &&
          typeof record.id === 'string' &&
          typeof record.payload === 'string' &&
          Number.isFinite(record.updatedAt),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async save(record: RecoveryRecord): Promise<void> {
    await this.transaction('readwrite', (store) => store.put(record));
  }

  async remove(id: string): Promise<void> {
    await this.transaction('readwrite', (store) => store.delete(id));
  }
}
