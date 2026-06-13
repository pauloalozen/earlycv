type EmitResultadoEvent = (
  eventName: string,
  metadata?: Record<string, unknown>,
) => void;

type UnlockMethod = "credit" | "review_redeem";

export function emitUnlockStarted(input: {
  adaptationId: string | null;
  emitResultadoEvent: EmitResultadoEvent;
  sourceDetail: string;
  unlockMethod: UnlockMethod;
}) {
  input.emitResultadoEvent("cv_unlock_started", {
    adaptationId: input.adaptationId,
    source_detail: input.sourceDetail,
    unlockMethod: input.unlockMethod,
  });
}

export function emitUnlockCompleted(input: {
  adaptationId: string | null;
  emitResultadoEvent: EmitResultadoEvent;
  remainingCredits: number;
  sourceDetail: string;
  unlockMethod: UnlockMethod;
}) {
  input.emitResultadoEvent("cv_unlock_completed", {
    adaptationId: input.adaptationId,
    remainingCredits: input.remainingCredits,
    source_detail: input.sourceDetail,
    unlockMethod: input.unlockMethod,
  });
}
