import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  clearGuestAnalysisRaw,
  getGuestAnalysisRaw,
  setGuestAnalysisRaw,
} from "./guest-analysis-storage";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error restoring optional global
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

test("setGuestAnalysisRaw persists payload in sessionStorage and localStorage", () => {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage, localStorage },
  });

  const payload = JSON.stringify({ id: "snapshot-1" });
  setGuestAnalysisRaw(payload);

  assert.equal(sessionStorage.getItem("guestAnalysis"), payload);
  assert.equal(localStorage.getItem("guestAnalysis"), payload);
  assert.equal(getGuestAnalysisRaw(), payload);
});

test("getGuestAnalysisRaw falls back to localStorage when sessionStorage is empty", () => {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage, localStorage },
  });

  localStorage.setItem("guestAnalysis", "persisted-local");
  assert.equal(getGuestAnalysisRaw(), "persisted-local");
});

test("clearGuestAnalysisRaw removes guest analysis from both storages", () => {
  const sessionStorage = new MemoryStorage();
  const localStorage = new MemoryStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage, localStorage },
  });

  sessionStorage.setItem("guestAnalysis", "a");
  localStorage.setItem("guestAnalysis", "b");

  clearGuestAnalysisRaw();

  assert.equal(sessionStorage.getItem("guestAnalysis"), null);
  assert.equal(localStorage.getItem("guestAnalysis"), null);
});
