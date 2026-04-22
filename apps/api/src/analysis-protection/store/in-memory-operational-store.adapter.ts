import type { OperationalStorePort } from "./operational-store.port";

type StoredEntry = {
  expiresAt: number;
  value: unknown;
};

export class InMemoryOperationalStoreAdapter implements OperationalStorePort {
  private readonly now: () => number;
  private readonly state = new Map<string, StoredEntry>();

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async incrWindow(key: string, ttlMs: number): Promise<number> {
    const entry = this.readEntry(key);
    const nextValue = (typeof entry?.value === "number" ? entry.value : 0) + 1;

    this.state.set(key, {
      expiresAt: this.now() + ttlMs,
      value: nextValue,
    });

    return nextValue;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.readEntry(key);

    if (!entry) {
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.state.set(key, {
      expiresAt: this.now() + ttlMs,
      value,
    });
  }

  async setNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (this.readEntry(key)) {
      return false;
    }

    this.state.set(key, {
      expiresAt: this.now() + ttlMs,
      value,
    });

    return true;
  }

  async compareAndDelete(key: string, expectedValue: string): Promise<boolean> {
    const entry = this.readEntry(key);

    if (!entry || entry.value !== expectedValue) {
      return false;
    }

    this.state.delete(key);

    return true;
  }

  async del(key: string): Promise<void> {
    this.state.delete(key);
  }

  private readEntry(key: string) {
    const entry = this.state.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= this.now()) {
      this.state.delete(key);

      return null;
    }

    return entry;
  }
}
