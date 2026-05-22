import { Injectable } from "@nestjs/common";
import type { PaymentRecoveryConfig } from "./payment-recovery.types";

function toBool(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue === undefined) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function clampInt(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (rawValue === undefined) {
    return fallback;
  }

  const normalized = rawValue.trim();
  if (!/^[-+]?\d+$/.test(normalized)) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed < min) {
    return min;
  }

  if (parsed > max) {
    return max;
  }

  return parsed;
}

function parseAllowlist(rawValue: string | undefined): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

@Injectable()
export class PaymentRecoveryConfigService {
  isAdminEnabled(): boolean {
    return toBool(process.env.ADMIN_PAYMENT_RECOVERY_ENABLED, false);
  }

  isEmailEnabled(): boolean {
    return toBool(process.env.PAYMENT_RECOVERY_EMAIL_ENABLED, false);
  }

  isDryRun(): boolean {
    return toBool(process.env.PAYMENT_RECOVERY_EMAIL_DRY_RUN, true);
  }

  emailAllowlist(): string[] {
    return parseAllowlist(process.env.PAYMENT_RECOVERY_EMAIL_ALLOWLIST);
  }

  tokenTtlDays(): number {
    return clampInt(process.env.PAYMENT_RECOVERY_TOKEN_TTL_DAYS, 7, 1, 30);
  }

  publicRateLimitPerMinute(): number {
    return clampInt(
      process.env.PAYMENT_RECOVERY_PUBLIC_RATE_LIMIT_PER_MINUTE,
      30,
      1,
      120,
    );
  }

  isTokenSingleUse(): boolean {
    return toBool(process.env.PAYMENT_RECOVERY_TOKEN_SINGLE_USE, true);
  }

  getConfig(): PaymentRecoveryConfig {
    return {
      adminEnabled: this.isAdminEnabled(),
      emailEnabled: this.isEmailEnabled(),
      emailDryRun: this.isDryRun(),
      emailAllowlist: this.emailAllowlist(),
      tokenTtlDays: this.tokenTtlDays(),
      publicRateLimitPerMinute: this.publicRateLimitPerMinute(),
      tokenSingleUse: this.isTokenSingleUse(),
    };
  }
}
