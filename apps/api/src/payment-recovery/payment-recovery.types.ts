export type PaymentRecoveryConfig = {
  adminEnabled: boolean;
  emailEnabled: boolean;
  emailDryRun: boolean;
  emailAllowlist: string[];
  tokenTtlDays: number;
  publicRateLimitPerMinute: number;
  tokenSingleUse: boolean;
};

export const PAYMENT_RECOVERY_CONFIG = Symbol("PAYMENT_RECOVERY_CONFIG");
