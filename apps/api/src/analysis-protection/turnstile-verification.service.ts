import { Injectable } from "@nestjs/common";
import type { AnalysisRequestContext } from "./types";

type TurnstileSiteVerifyResponse = {
  action?: string;
  "error-codes"?: string[];
  challenge_ts?: string;
  success?: boolean;
};

export type TurnstileVerificationDecision = {
  reason:
    | "turnstile_expired"
    | "turnstile_invalid"
    | "turnstile_missing"
    | "turnstile_unavailable"
    | "turnstile_unconfigured"
    | null;
  valid: boolean;
};

type TurnstileVerificationOptions = {
  expectedAction?: string;
  maxTokenAgeMs?: number;
};

@Injectable()
export class TurnstileVerificationService {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async verifyToken(
    token: string | null | undefined,
    context: AnalysisRequestContext,
    options: TurnstileVerificationOptions = {},
  ): Promise<TurnstileVerificationDecision> {
    const normalizedToken = token?.trim() ?? "";

    if (normalizedToken.length === 0) {
      return { valid: false, reason: "turnstile_missing" };
    }

    if (process.env.SKIP_TURNSTILE_VERIFICATION === "true") {
      return { valid: true, reason: null };
    }

    const secret = this.resolveTurnstileSecret();

    if (!secret) {
      return { valid: false, reason: "turnstile_unconfigured" };
    }

    try {
      const response = await this.fetcher(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          body: new URLSearchParams({
            remoteip: context.ip ?? "",
            response: normalizedToken,
            secret,
          }),
          method: "POST",
        },
      );

      if (!response.ok) {
        return { valid: false, reason: "turnstile_unavailable" };
      }

      const payload =
        (await response.json()) as TurnstileSiteVerifyResponse | null;

      if (!payload?.success) {
        return { valid: false, reason: "turnstile_invalid" };
      }

      if (this.isExpired(payload.challenge_ts, options.maxTokenAgeMs)) {
        return { valid: false, reason: "turnstile_expired" };
      }

      if (!this.isExpectedAction(payload.action, options.expectedAction)) {
        return { valid: false, reason: "turnstile_invalid" };
      }

      return { valid: true, reason: null };
    } catch {
      return { valid: false, reason: "turnstile_unavailable" };
    }
  }

  private resolveTurnstileSecret() {
    const candidates = [
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
      process.env.TURNSTILE_SECRET_KEY,
      process.env.TURNSTILE_SECRET,
    ];

    for (const entry of candidates) {
      if (typeof entry !== "string") {
        continue;
      }

      const trimmed = entry.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    return undefined;
  }

  private isExpectedAction(
    action: string | undefined,
    expectedAction?: string,
  ) {
    const normalizedExpected = expectedAction?.trim() ?? "";

    if (normalizedExpected.length === 0) {
      return true;
    }

    return (action?.trim() ?? "") === normalizedExpected;
  }

  private isExpired(challengeTs: string | undefined, maxTokenAgeMs?: number) {
    if (!challengeTs || !maxTokenAgeMs) {
      return false;
    }

    const challengeAt = Date.parse(challengeTs);

    if (Number.isNaN(challengeAt)) {
      return false;
    }

    return this.now() - challengeAt > maxTokenAgeMs;
  }
}
