import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  clearPendingGuestAnalysis,
  getPendingGuestAnalysis,
  setPendingGuestAnalysis,
} from "./guest-analysis-pending";

// Fase 5 do gate de autenticação guest: referência leve (jobId +
// guestPossessionToken) por aba, nunca o resultado da análise em si.
// sessionStorage é deliberado — por aba, ao contrário de localStorage.

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

function installWindow() {
  const sessionStorage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage },
  });
  return sessionStorage;
}

test("setPendingGuestAnalysis + getPendingGuestAnalysis round-trips jobId and guestPossessionToken", () => {
  installWindow();

  setPendingGuestAnalysis({
    jobId: "job-1",
    guestPossessionToken: "token-abc",
  });

  assert.deepEqual(getPendingGuestAnalysis(), {
    jobId: "job-1",
    guestPossessionToken: "token-abc",
  });
});

test("getPendingGuestAnalysis returns null when nothing was stored", () => {
  installWindow();
  assert.equal(getPendingGuestAnalysis(), null);
});

test("getPendingGuestAnalysis returns null for malformed/tampered storage content", () => {
  const sessionStorage = installWindow();

  sessionStorage.setItem(
    "guest_analysis_pending",
    JSON.stringify({ jobId: 123, guestPossessionToken: null }),
  );
  assert.equal(getPendingGuestAnalysis(), null);

  sessionStorage.setItem("guest_analysis_pending", "not json");
  assert.equal(getPendingGuestAnalysis(), null);
});

test("clearPendingGuestAnalysis removes the stored reference", () => {
  installWindow();

  setPendingGuestAnalysis({ jobId: "job-1", guestPossessionToken: "t" });
  clearPendingGuestAnalysis();
  assert.equal(getPendingGuestAnalysis(), null);
});

test("all functions are no-ops (never throw) when window is undefined (server-side)", () => {
  // @ts-expect-error simulating server-side (no window global)
  delete globalThis.window;

  assert.doesNotThrow(() => {
    setPendingGuestAnalysis({ jobId: "job-1", guestPossessionToken: "t" });
    getPendingGuestAnalysis();
    clearPendingGuestAnalysis();
  });
});
