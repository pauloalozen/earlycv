import {
  type CanActivate,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";

import { PaymentRecoveryConfigService } from "./payment-recovery.config";

type Bucket = { count: number; startedAt: number };

@Injectable()
export class PaymentRecoveryPublicRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    @Inject(PaymentRecoveryConfigService)
    private readonly config: PaymentRecoveryConfigService,
  ) {}

  canActivate(context: {
    switchToHttp: () => { getRequest: () => { ip?: string } };
  }): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = (request.ip ?? "unknown").trim() || "unknown";
    const limit = this.config.publicRateLimitPerMinute();
    const now = Date.now();
    const ttlMs = 60_000;
    const key = `payment-recovery:${ip}`;
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.startedAt >= ttlMs) {
      this.buckets.set(key, { count: 1, startedAt: now });
      return true;
    }

    if (bucket.count >= limit) {
      throw new HttpException(
        "Too many requests",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    return true;
  }
}
