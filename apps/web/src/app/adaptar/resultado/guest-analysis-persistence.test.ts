import { describe, expect, it } from "vitest";

import { shouldPersistGuestAnalysis } from "./guest-analysis-persistence";

describe("shouldPersistGuestAnalysis", () => {
  it("persists when user is authenticated even without autoSave query flag", () => {
    expect(
      shouldPersistGuestAnalysis({
        autoSave: false,
        hasRawData: true,
        hasReviewAdaptationId: false,
        isAuthenticated: true,
        persistenceAlreadyAttempted: false,
      }),
    ).toBe(true);
  });

  it("does not persist when user is not authenticated", () => {
    expect(
      shouldPersistGuestAnalysis({
        autoSave: true,
        hasRawData: true,
        hasReviewAdaptationId: false,
        isAuthenticated: false,
        persistenceAlreadyAttempted: false,
      }),
    ).toBe(false);
  });
});
