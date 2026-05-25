/* biome-ignore-all lint/suspicious/noExplicitAny: prisma mock arguments are intentionally open */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { PaymentRecoveryIgnoreService } from "./payment-recovery-ignore.service";

test("ignore/unignore persists at displayed grouping level", async () => {
  const upsertCalls: string[] = [];
  let deletedIds: string[] = [];
  const service = new PaymentRecoveryIgnoreService({
    planPurchase: {
      findUnique: async () => ({
        id: "purchase-2",
        userId: "user-1",
        originAdaptationId: "adapt-1",
        originAction: "unlock_cv",
      }),
      findMany: async () => [{ id: "purchase-1" }, { id: "purchase-2" }],
    },
    paymentRecoveryIgnore: {
      upsert: async (args: any) => {
        upsertCalls.push(args.where.purchaseId);
        return args.create;
      },
      deleteMany: async (args: any) => {
        deletedIds = args.where.purchaseId.in;
        return { count: deletedIds.length };
      },
    },
  } as any);

  await service.ignore({
    purchaseId: "purchase-2",
    ignoredByAdminUserId: "admin-1",
    reason: "noise",
  });
  await service.unignore({ purchaseId: "purchase-2" });

  assert.deepEqual(upsertCalls.sort(), ["purchase-1", "purchase-2"]);
  assert.deepEqual(deletedIds.sort(), ["purchase-1", "purchase-2"]);
});
