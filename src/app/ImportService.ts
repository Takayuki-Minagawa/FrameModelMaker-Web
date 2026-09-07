import { prepareDocumentImport, type PreparedImport } from '../io/ImportDocument';

/** Cancels obsolete workers and tags replies with the revision they were based on. */
export class ImportService {
  private request = 0;
  private cancelActive: (() => void) | undefined;

  cancel(): void {
    this.request++;
    this.cancelActive?.();
    this.cancelActive = undefined;
  }

  async prepare(text: string, format: 'json' | 'yaml', revision: number): Promise<PreparedImport> {
    this.cancel();
    const id = this.request;
    if (text.length < 1024 * 1024 || typeof Worker === 'undefined') {
      const result = await prepareDocumentImport(text, format);
      if (id !== this.request) throw new Error('Import superseded.');
      return result;
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../io/ImportWorker.ts', import.meta.url), { type: 'module' });
      const close = () => {
        worker.terminate();
        if (id === this.request) this.cancelActive = undefined;
      };
      this.cancelActive = () => {
        close();
        reject(new Error('Import superseded.'));
      };
      worker.onmessage = (event) => {
        if (event.data.id !== id || event.data.revision !== revision || id !== this.request) return;
        close();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.result as PreparedImport);
      };
      worker.onerror = (event) => {
        close();
        reject(new Error(event.message));
      };
      worker.postMessage({ id, revision, text, format });
    });
  }
}
