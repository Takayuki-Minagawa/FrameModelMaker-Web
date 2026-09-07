import type { KeyValueStorage } from './DocumentHistory';

/** Preferences remain usable when browser storage is disabled or full. */
export class SettingsRepository implements KeyValueStorage {
  private readonly memory = new Map<string, string | null>();
  private failed = false;
  private listeners = new Set<(available: boolean) => void>();

  constructor(private readonly storage: () => KeyValueStorage = () => globalThis.localStorage) {}

  get available(): boolean {
    return !this.failed;
  }

  subscribe(listener: (available: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private unavailable(): void {
    this.failed = true;
    this.listeners.forEach((listener) => listener(false));
  }

  getItem(key: string): string | null {
    if (this.memory.has(key)) return this.memory.get(key) ?? null;
    try {
      return this.storage().getItem(key);
    } catch {
      this.unavailable();
      return null;
    }
  }

  setItem(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      this.storage().setItem(key, value);
    } catch {
      this.unavailable();
    }
  }

  removeItem(key: string): void {
    this.memory.set(key, null);
    try {
      this.storage().removeItem(key);
    } catch {
      this.unavailable();
    }
  }

  choice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const value = this.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  }
}

export const settings = new SettingsRepository();
