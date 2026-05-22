import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PlanPurchaseOriginAction } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

@Injectable()
export class PaymentRecoveryIgnoreService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async ignore(input: {
    purchaseId: string;
    ignoredByAdminUserId: string;
    reason?: string;
  }) {
    const purchase = await this.database.planPurchase.findUnique({
      where: { id: input.purchaseId },
      select: { id: true, userId: true, originAdaptationId: true, originAction: true },
    });
    if (!purchase) {
      throw new NotFoundException("purchase not found");
    }

    const targetIds = await this.resolveGroupPurchaseIds(purchase);
    const rows = await Promise.all(
      targetIds.map((purchaseId) =>
        this.database.paymentRecoveryIgnore.upsert({
          where: { purchaseId },
          create: {
            purchaseId,
            userId: purchase.userId,
            adaptationId: purchase.originAdaptationId,
            reason: input.reason?.trim() || null,
            ignoredByAdminId: input.ignoredByAdminUserId,
            ignoredAt: new Date(),
          },
          update: {
            reason: input.reason?.trim() || null,
            ignoredByAdminId: input.ignoredByAdminUserId,
            ignoredAt: new Date(),
          },
        }),
      ),
    );

    return rows;
  }

  async unignore(input: { purchaseId: string }) {
    const purchase = await this.database.planPurchase.findUnique({
      where: { id: input.purchaseId },
      select: { id: true, userId: true, originAdaptationId: true, originAction: true },
    });
    if (!purchase) {
      throw new NotFoundException("purchase not found");
    }

    const targetIds = await this.resolveGroupPurchaseIds(purchase);
    await this.database.paymentRecoveryIgnore.deleteMany({
      where: { purchaseId: { in: targetIds } },
    });
  }

  private async resolveGroupPurchaseIds(purchase: {
    userId: string;
    originAdaptationId: string | null;
    originAction: PlanPurchaseOriginAction;
  }) {
    const groupRows = await this.database.planPurchase.findMany({
      where: {
        userId: purchase.userId,
        ...(purchase.originAdaptationId
          ? { originAdaptationId: purchase.originAdaptationId }
          : {
              originAdaptationId: null,
              originAction: purchase.originAction,
            }),
      },
      select: { id: true },
    });
    return groupRows.map((row) => row.id);
  }
}
