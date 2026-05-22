import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class PaymentRecoveryPublicEventsService {
  private readonly logger = new Logger(PaymentRecoveryPublicEventsService.name);

  emit(event: string, payload: Record<string, unknown>): void {
    this.logger.log(`[payment-recovery-public] ${event} ${JSON.stringify(payload)}`);
  }
}
