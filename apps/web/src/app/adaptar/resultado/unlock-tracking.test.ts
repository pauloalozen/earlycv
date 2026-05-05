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
});
