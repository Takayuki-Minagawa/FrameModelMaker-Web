import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { FrameDocument } from '../../src/models/FrameDocument';
import { DocumentHistory } from '../../src/services/DocumentHistory';
import { RecoveryRepository } from '../../src/services/RecoveryRepository';
import { RecoveryService, LEGACY_RECOVERY_KEY } from '../../src/services/RecoveryService';

describe('Recovery', () => {
  it('keeps sessions separate and commits saves in order', async () => {
    const repository = new RecoveryRepository(crypto.randomUUID());
    const first = new RecoveryService(repository); const second = new RecoveryService(repository);
    const doc = new FrameDocument(); const history = new DocumentHistory(doc);
    doc.addNode(); const a = first.save(history, 'A');
    doc.addNode(); const b = first.save(history, 'B');
    const c = second.save(history, 'C');
    await Promise.all([a, b, c]);
    const records = await repository.list();
    expect(records).toHaveLength(2);
    const record = records.find(item => item.sessionId === first.sessionId)!;
    expect(record.title).toBe('B'); expect(record.revision).toBe(2);
    const restored = new FrameDocument(); new DocumentHistory(restored).restoreAutosave(record.payload);
    expect(restored.nodes).toHaveLength(2);
    await first.remove(record.id);
    expect(await repository.list()).toHaveLength(1);
  });

  it('validates legacy data before migration and retains corrupt input', async () => {
    const service = new RecoveryService(new RecoveryRepository(crypto.randomUUID()));
    const data = new Map([[LEGACY_RECOVERY_KEY, 'broken']]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    await expect(service.migrateLegacy(storage)).rejects.toThrow();
    expect(data.has(LEGACY_RECOVERY_KEY)).toBe(true);
    data.set(LEGACY_RECOVERY_KEY, new DocumentHistory(new FrameDocument()).serializeAutosave());
    expect(await service.migrateLegacy(storage)).toBe(true);
    expect(data.has(LEGACY_RECOVERY_KEY)).toBe(false);
    expect(await service.repository.list()).toHaveLength(1);
  });

  it('limits history size while preserving the active checkpoint', () => {
    const doc = new FrameDocument();
    const history = new DocumentHistory(doc, { maxBytes: 1024 });
    for (let i = 0; i < 20; i++) doc.addNode();
    expect(history.length).toBe(1);
    const restored = new FrameDocument(); new DocumentHistory(restored).restoreAutosave(history.serializeAutosave());
    expect(restored.nodes).toHaveLength(20);
  });
});

it('quota failure is visible, retry recovers, and an old save cannot overwrite new-model status', async () => {
  const repository = new RecoveryRepository(crypto.randomUUID());
  const service = new RecoveryService(repository); const history = new DocumentHistory(new FrameDocument());
  const save = repository.save.bind(repository); repository.save = async () => { throw new DOMException('Full', 'QuotaExceededError'); };
  await expect(service.save(history, 'fail')).rejects.toThrow(); expect(service.status.state).toBe('failed');
  repository.save = save; await service.save(history, 'retry'); expect(service.status.state).toBe('saved');
  let release!:()=>void; repository.save = () => new Promise<void>(resolve=>{release=resolve;});
  const pending=service.save(history,'old'); await Promise.resolve(); await Promise.resolve(); service.newModel(); release(); await pending;
  expect(service.status.state).toBe('idle'); expect(await repository.list()).toHaveLength(1);
});
