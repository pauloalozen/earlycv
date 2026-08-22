import { describe, expect, it, vi } from "vitest";

import { emitUnlockCompleted, emitUnlockStarted } from "./unlock-tracking";

describe("unlock tracking helpers", () => {
  it("emits started and completed payloads with expected metadata", () => {
    const emitResultadoEventMock = vi.fn();

    emitUnlockStarted({
      adaptationId: "adp-1",
      emitResultadoEvent: emitResultadoEventMock,
      sourceDetail: "resultado",
      unlockMethod: "review_redeem",
    });

    emitUnlockCompleted({
      adaptationId: "adp-1",
      emitResultadoEvent: emitResultadoEventMock,
      remainingCredits: 0,
      sourceDetail: "resultado",
      unlockMethod: "review_redeem",
    });

    expect(emitResultadoEventMock).toHaveBeenCalledTimes(2);
    expect(emitResultadoEventMock).toHaveBeenNthCalledWith(
      1,
      "cv_unlock_started",
      {
        adaptationId: "adp-1",
        source_detail: "resultado",
        unlockMethod: "review_redeem",
      },
    );
    expect(emitResultadoEventMock).toHaveBeenNthCalledWith(
      2,
      "cv_unlock_completed",
      {
        adaptationId: "adp-1",
        remainingCredits: 0,
        source_detail: "resultado",
        unlockMethod: "review_redeem",
      },
    );
  });

  it("passes remainingCredits as null when the backend does not reliably report the post-consumption balance — never a fictitious 0", () => {
    const emitResultadoEventMock = vi.fn();

    emitUnlockCompleted({
      adaptationId: "adp-2",
      emitResultadoEvent: emitResultadoEventMock,
      remainingCredits: null,
      sourceDetail: "resultado",
      unlockMethod: "credit",
    });

    expect(emitResultadoEventMock).toHaveBeenCalledWith(
      "cv_unlock_completed",
      expect.objectContaining({ remainingCredits: null }),
    );
  });

  it("passes through a real non-zero balance when the backend does report it", () => {
    const emitResultadoEventMock = vi.fn();

    emitUnlockCompleted({
      adaptationId: "adp-3",
      emitResultadoEvent: emitResultadoEventMock,
      remainingCredits: 4,
      sourceDetail: "resultado",
      unlockMethod: "credit",
    });

    expect(emitResultadoEventMock).toHaveBeenCalledWith(
      "cv_unlock_completed",
      expect.objectContaining({ remainingCredits: 4 }),
    );
  });
});
