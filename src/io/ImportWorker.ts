import { prepareDocumentImport } from './ImportDocument';

self.onmessage = async (
  event: MessageEvent<{ id: number; revision: number; text: string; format: 'json' | 'yaml' }>,
) => {
  const { id, revision, text, format } = event.data;
  try {
    self.postMessage({ id, revision, result: await prepareDocumentImport(text, format) });
  } catch (error) {
    self.postMessage({ id, revision, error: error instanceof Error ? error.message : String(error) });
  }
};
