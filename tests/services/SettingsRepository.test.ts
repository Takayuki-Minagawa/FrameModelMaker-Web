import { describe, expect, it } from 'vitest';
import { SettingsRepository } from '../../src/services/SettingsRepository';

describe('SettingsRepository', () => {
  it('keeps preferences usable when obtaining storage throws', () => {
    const repository = new SettingsRepository(() => { throw new Error('Denied'); });
    expect(repository.choice('lang', ['ja', 'en'], 'ja')).toBe('ja');
    repository.setItem('lang', 'en');
    expect(repository.getItem('lang')).toBe('en');
    repository.removeItem('lang');
    expect(repository.getItem('lang')).toBeNull();
    expect(repository.available).toBe(false);
  });

  it('validates persisted choices and survives individual method failures', () => {
    const repository = new SettingsRepository(() => ({
      getItem: () => 'fr',
      setItem: () => { throw new Error('Quota'); },
      removeItem: () => { throw new Error('Denied'); },
    }));
    expect(repository.choice('lang', ['ja', 'en'], 'ja')).toBe('ja');
    repository.setItem('lang', 'en');
    expect(repository.choice('lang', ['ja', 'en'], 'ja')).toBe('en');
    repository.removeItem('lang');
    expect(repository.getItem('lang')).toBeNull();
  });
});
