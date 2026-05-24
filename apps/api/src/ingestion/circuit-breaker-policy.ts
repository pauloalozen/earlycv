export const CIRCUIT_BREAKER_403_THRESHOLD = 3;
export const CIRCUIT_BREAKER_PAUSE_HOURS = 6;
export const CIRCUIT_BREAKER_PAUSE_REASON = "gupy_403_circuit_breaker";

export type CircuitBreakerEvent = "success" | "error_403" | "error_other";

type Evaluate403CircuitBreakerInput = {
  event: CircuitBreakerEvent;
  now: Date;
  previousConsecutive403Count: number;
  previousPauseReason: string | null;
  previousPausedUntil: Date | null;
};

type Evaluate403CircuitBreakerOutput = {
  consecutive403Count: number;
  pauseReason: string | null;
  pauseTriggered: boolean;
  pausedUntil: Date | null;
};

export function evaluate403CircuitBreaker(
  input: Evaluate403CircuitBreakerInput,
): Evaluate403CircuitBreakerOutput {
  if (input.event === "success") {
    return {
      consecutive403Count: 0,
      pauseReason: null,
      pauseTriggered: false,
      pausedUntil: null,
    };
  }

  if (input.event === "error_other") {
    return {
      consecutive403Count: input.previousConsecutive403Count,
      pauseReason: input.previousPauseReason,
      pauseTriggered: false,
      pausedUntil: input.previousPausedUntil,
    };
  }

  const nextConsecutive403Count = input.previousConsecutive403Count + 1;
  const shouldPause = nextConsecutive403Count >= CIRCUIT_BREAKER_403_THRESHOLD;

  return {
    consecutive403Count: nextConsecutive403Count,
    pauseReason: shouldPause ? CIRCUIT_BREAKER_PAUSE_REASON : null,
    pauseTriggered: shouldPause,
    pausedUntil: shouldPause
      ? new Date(
          input.now.getTime() + CIRCUIT_BREAKER_PAUSE_HOURS * 60 * 60 * 1000,
        )
      : null,
  };
}
