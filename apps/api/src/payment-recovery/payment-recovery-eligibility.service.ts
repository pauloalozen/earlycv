import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

type EligibilityStatus = "eligible" | "possibly_resolved" | "not_eligible";

type PurchaseRecord = {
  id: string;
  userId: string;
  planType: string;
  amountInCents: number;
  status: string;
  paymentReference: string;
  mpPaymentId: string | null;
  mpMerchantOrderId: string | null;
  mpPreferenceId: string | null;
  originAction: string;
  originAdaptationId: string | null;
  creditsGranted: number;
  paidAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    creditsRemaining: number;
  } | null;
  adaptation?: {
    id: string;
    userId: string;
    jobTitle: string | null;
    companyName: string | null;
    isUnlocked: boolean;
    adaptedContentJson: unknown;
  } | null;
};

type GroupedCandidates = {
  representative: PurchaseRecord;
  groupPurchases: PurchaseRecord[];
  relatedPendingPurchaseCount: number;
};

type EligibilityIndexes = {
  completedByUser: Map<string, PurchaseRecord[]>;
  completedUnlockByUserAndAdaptation: Map<string, PurchaseRecord[]>;
};

type EligibilityReason =
  | "missing_user"
  | "missing_user_email"
  | "unsupported_origin_action"
  | "missing_checkout_context"
  | "terminal_purchase_status"
  | "missing_adaptation_context"
  | "adaptation_already_unlocked"
  | "approved_purchase_after_pending"
  | "approved_purchase_after_pending_same_adaptation"
  | "user_has_available_credits"
  | "pending_buy_credits_without_posterior_credit"
  | "pending_unlock_cv_not_unlocked";

export type PaymentRecoveryEligibilityItem = {
  userId: string;
  userName: string;
  userEmail: string;
  purchaseId: string;
  purchaseStatus: string;
  originAction: string;
  originAdaptationId: string | null;
  planName: string;
  amount: number;
  createdAt: string;
  jobTitle: string | null;
  companyName: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
  currentUserCredits: number;
  hasAvailableCredits: boolean;
  hasApprovedPurchaseAfterPending: boolean;
  isAdaptationUnlocked: boolean;
  eligibilityStatus: EligibilityStatus;
  eligibilityReason: EligibilityReason;
  relatedPendingPurchaseCount: number;
  lastRecoveryEmailSentAt: string | null;
  recoveryEmailCount: number;
  ignored: boolean;
  ignoredAt: string | null;
  ignoredByAdminUserId: string | null;
};

export type PaymentRecoveryEligibilityListOutput = {
  items: PaymentRecoveryEligibilityItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type PaymentRecoveryEligibilityByPurchaseOutput = {
  item: PaymentRecoveryEligibilityItem | null;
  recoveryGroupKey: string | null;
  groupPurchaseIds: string[];
};

export type PaymentRecoveryListPendingFilters = {
  eligibilityStatus?: "eligible" | "possibly_resolved" | "not_eligible" | "all";
  originAction?: "unlock_cv" | "buy_credits" | "all";
  alreadySent?: "true" | "false" | "all";
  hasAvailableCredits?: "true" | "false" | "all";
  ignored?: "true" | "false" | "all";
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

const PENDING_STATUSES = new Set([
  "none",
  "pending",
  "processing_payment",
  "pending_payment",
]);
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "refunded",
  "cancelled",
  "expired_unrecoverable",
]);

function planTypeToLabel(planType: string): string {
  if (planType === "starter") {
    return "Starter";
  }
  if (planType === "pro") {
    return "Pro";
  }
  if (planType === "turbo") {
    return "Turbo";
  }
  return planType;
}

function readScoreFields(adaptedContentJson: unknown): {
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
} {
  if (!adaptedContentJson || typeof adaptedContentJson !== "object") {
    return { scoreBefore: null, scoreAfter: null, scoreDelta: null };
  }

  const content = adaptedContentJson as Record<string, unknown>;

  const scoreBefore =
    typeof content.scoreBefore === "number" ? content.scoreBefore : null;
  const scoreAfter =
    typeof content.scoreAfter === "number" ? content.scoreAfter : null;
  const scoreDelta =
    typeof content.scoreDelta === "number"
      ? content.scoreDelta
      : scoreBefore !== null && scoreAfter !== null
        ? scoreAfter - scoreBefore
        : null;

  return { scoreBefore, scoreAfter, scoreDelta };
}

function hasCheckoutEvidence(purchase: PurchaseRecord): boolean {
  return Boolean(
    purchase.mpPreferenceId ||
      purchase.mpPaymentId ||
      purchase.mpMerchantOrderId ||
      purchase.paymentReference,
  );
}

function sortByNewest(a: PurchaseRecord, b: PurchaseRecord): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

@Injectable()
export class PaymentRecoveryEligibilityService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async listPending(
    filters: PaymentRecoveryListPendingFilters = {},
  ): Promise<PaymentRecoveryEligibilityListOutput> {
    const purchases = (await this.database.planPurchase.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true, creditsRemaining: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })) as PurchaseRecord[];

    const adaptationIds = [...new Set(
      purchases
        .map((purchase) => purchase.originAdaptationId)
        .filter((id): id is string => Boolean(id)),
    )];

    const adaptations = adaptationIds.length
      ? await this.database.cvAdaptation.findMany({
          where: { id: { in: adaptationIds } },
          select: {
            id: true,
            userId: true,
            jobTitle: true,
            companyName: true,
            isUnlocked: true,
            adaptedContentJson: true,
          },
        })
      : [];

    const adaptationById = new Map(adaptations.map((adaptation) => [adaptation.id, adaptation]));
    for (const purchase of purchases) {
      purchase.adaptation = purchase.originAdaptationId
        ? adaptationById.get(purchase.originAdaptationId) ?? null
        : null;
    }

    const grouped = this.groupCandidates(purchases);
    const allGroupedPurchaseIds = [
      ...new Set(
        grouped.flatMap((entry) => entry.groupPurchases.map((purchase) => purchase.id)),
      ),
    ];
    const indexes = this.buildIndexes(purchases);

    const recoveryEmailHistory = allGroupedPurchaseIds.length
      ? await this.database.paymentRecoveryEmail.findMany({
          where: { purchaseId: { in: allGroupedPurchaseIds } },
          select: { purchaseId: true, sentAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const historyRowsByPurchaseId = new Map<
      string,
      { sentAt: Date | null; createdAt: Date }[]
    >();
    for (const row of recoveryEmailHistory) {
      const current = historyRowsByPurchaseId.get(row.purchaseId) ?? [];
      current.push({ sentAt: row.sentAt, createdAt: row.createdAt });
      historyRowsByPurchaseId.set(row.purchaseId, current);
    }

    const ignoredRows = allGroupedPurchaseIds.length
      ? await this.database.paymentRecoveryIgnore.findMany({
          where: { purchaseId: { in: allGroupedPurchaseIds } },
          select: {
            purchaseId: true,
            ignoredAt: true,
            ignoredByAdminId: true,
          },
        })
      : [];
    const ignoredByPurchaseId = new Map(
      ignoredRows.map((row) => [row.purchaseId, row]),
    );

    const items = grouped
      .map(({ representative, relatedPendingPurchaseCount, groupPurchases }) => {
      const classification = this.classifyPurchase(representative, indexes);
      const scores = readScoreFields(representative.adaptation?.adaptedContentJson);
      let recoveryEmailCount = 0;
      let lastRecoveryEmailSentAt: string | null = null;
      let latestSentAt = Number.NEGATIVE_INFINITY;
      for (const purchase of groupPurchases) {
        const rows = historyRowsByPurchaseId.get(purchase.id) ?? [];
        recoveryEmailCount += rows.length;
        for (const row of rows) {
          if (row.sentAt && row.sentAt.getTime() > latestSentAt) {
            latestSentAt = row.sentAt.getTime();
            lastRecoveryEmailSentAt = row.sentAt.toISOString();
          }
        }
      }

      const ignoredRowsForGroup = groupPurchases
        .map((purchase) => ignoredByPurchaseId.get(purchase.id))
        .filter((row) => Boolean(row));
      const latestIgnored = ignoredRowsForGroup.sort(
        (a, b) => b!.ignoredAt.getTime() - a!.ignoredAt.getTime(),
      )[0];

      return {
        userId: representative.userId,
        userName: representative.user?.name ?? "",
        userEmail: representative.user?.email ?? "",
        purchaseId: representative.id,
        purchaseStatus: representative.status,
        originAction: representative.originAction,
        originAdaptationId: representative.originAdaptationId,
        planName: planTypeToLabel(representative.planType),
        amount: representative.amountInCents / 100,
        createdAt: representative.createdAt.toISOString(),
        jobTitle: representative.adaptation?.jobTitle ?? null,
        companyName: representative.adaptation?.companyName ?? null,
        scoreBefore: scores.scoreBefore,
        scoreAfter: scores.scoreAfter,
        scoreDelta: scores.scoreDelta,
        currentUserCredits: representative.user?.creditsRemaining ?? 0,
        hasAvailableCredits: (representative.user?.creditsRemaining ?? 0) > 0,
        hasApprovedPurchaseAfterPending:
          classification.hasApprovedPurchaseAfterPending,
        isAdaptationUnlocked: representative.adaptation?.isUnlocked ?? false,
        eligibilityStatus: classification.status,
        eligibilityReason: classification.reason,
        relatedPendingPurchaseCount,
        lastRecoveryEmailSentAt,
        recoveryEmailCount,
        ignored: Boolean(latestIgnored),
        ignoredAt: latestIgnored?.ignoredAt.toISOString() ?? null,
        ignoredByAdminUserId: latestIgnored?.ignoredByAdminId ?? null,
      } satisfies PaymentRecoveryEligibilityItem;
      })
      .filter((item) => PENDING_STATUSES.has(item.purchaseStatus));

    const filtered = items.filter((item) => {
      const eligibilityStatus = filters.eligibilityStatus ?? "eligible";
      if (eligibilityStatus !== "all" && item.eligibilityStatus !== eligibilityStatus) {
        return false;
      }
      const originAction = filters.originAction ?? "all";
      if (originAction !== "all" && item.originAction !== originAction) {
        return false;
      }
      const alreadySent = filters.alreadySent ?? "all";
      if (alreadySent !== "all") {
        const expected = alreadySent === "true";
        if ((item.recoveryEmailCount > 0) !== expected) {
          return false;
        }
      }
      const hasAvailableCredits = filters.hasAvailableCredits ?? "all";
      if (hasAvailableCredits !== "all") {
        const expected = hasAvailableCredits === "true";
        if (item.hasAvailableCredits !== expected) {
          return false;
        }
      }
      const ignored = filters.ignored ?? "false";
      if (ignored !== "all") {
        const expected = ignored === "true";
        if (item.ignored !== expected) {
          return false;
        }
      }
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom);
        if (!Number.isNaN(from.getTime()) && new Date(item.createdAt) < from) {
          return false;
        }
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        if (!Number.isNaN(to.getTime()) && new Date(item.createdAt) > to) {
          return false;
        }
      }
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        const text = `${item.userName} ${item.userEmail}`.toLowerCase();
        if (!text.includes(q)) {
          return false;
        }
      }

      return true;
    });

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return { items: paged, total: filtered.length, page, pageSize };
  }

  async evaluateByPurchaseId(
    purchaseId: string,
  ): Promise<PaymentRecoveryEligibilityByPurchaseOutput> {
    const purchase = (await this.database.planPurchase.findUnique({
      where: { id: purchaseId },
      include: {
        user: {
          select: { id: true, name: true, email: true, creditsRemaining: true },
        },
      },
    })) as PurchaseRecord | null;

    if (!purchase) {
      return { item: null, recoveryGroupKey: null, groupPurchaseIds: [] };
    }

    if (purchase.originAdaptationId) {
      const adaptation = await this.database.cvAdaptation.findUnique({
        where: { id: purchase.originAdaptationId },
        select: {
          id: true,
          userId: true,
          jobTitle: true,
          companyName: true,
          isUnlocked: true,
          adaptedContentJson: true,
        },
      });
      purchase.adaptation = adaptation;
    }

    const recoveryGroupKey = purchase.originAdaptationId
      ? `${purchase.userId}:${purchase.originAdaptationId}`
      : `${purchase.userId}:${purchase.originAction}`;

    const groupPurchases = (await this.database.planPurchase.findMany({
      where: purchase.originAdaptationId
        ? {
            userId: purchase.userId,
            originAdaptationId: purchase.originAdaptationId,
          }
        : {
            userId: purchase.userId,
            originAction: purchase.originAction as any,
            originAdaptationId: null,
          },
      include: {
        user: {
          select: { id: true, name: true, email: true, creditsRemaining: true },
        },
      },
    })) as PurchaseRecord[];

    const allUserPurchases = (await this.database.planPurchase.findMany({
      where: { userId: purchase.userId },
      include: {
        user: {
          select: { id: true, name: true, email: true, creditsRemaining: true },
        },
      },
    })) as PurchaseRecord[];
    const indexes = this.buildIndexes(allUserPurchases);
    const classification = this.classifyPurchase(purchase, indexes);
    const scores = readScoreFields(purchase.adaptation?.adaptedContentJson);

    const groupPurchaseIds = groupPurchases.map((entry) => entry.id);

    const recoveryEmailHistory = groupPurchaseIds.length
      ? await this.database.paymentRecoveryEmail.findMany({
          where: { purchaseId: { in: groupPurchaseIds } },
          select: { purchaseId: true, sentAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    let recoveryEmailCount = 0;
    let lastRecoveryEmailSentAt: string | null = null;
    let latestSentAt = Number.NEGATIVE_INFINITY;
    for (const row of recoveryEmailHistory) {
      recoveryEmailCount += 1;
      if (row.sentAt && row.sentAt.getTime() > latestSentAt) {
        latestSentAt = row.sentAt.getTime();
        lastRecoveryEmailSentAt = row.sentAt.toISOString();
      }
    }

    const ignoredRows = groupPurchaseIds.length
      ? await this.database.paymentRecoveryIgnore.findMany({
          where: { purchaseId: { in: groupPurchaseIds } },
          select: {
            purchaseId: true,
            ignoredAt: true,
            ignoredByAdminId: true,
          },
        })
      : [];
    const latestIgnored = ignoredRows.sort(
      (a, b) => b.ignoredAt.getTime() - a.ignoredAt.getTime(),
    )[0];

    const item: PaymentRecoveryEligibilityItem = {
      userId: purchase.userId,
      userName: purchase.user?.name ?? "",
      userEmail: purchase.user?.email ?? "",
      purchaseId: purchase.id,
      purchaseStatus: purchase.status,
      originAction: purchase.originAction,
      originAdaptationId: purchase.originAdaptationId,
      planName: planTypeToLabel(purchase.planType),
      amount: purchase.amountInCents / 100,
      createdAt: purchase.createdAt.toISOString(),
      jobTitle: purchase.adaptation?.jobTitle ?? null,
      companyName: purchase.adaptation?.companyName ?? null,
      scoreBefore: scores.scoreBefore,
      scoreAfter: scores.scoreAfter,
      scoreDelta: scores.scoreDelta,
      currentUserCredits: purchase.user?.creditsRemaining ?? 0,
      hasAvailableCredits: (purchase.user?.creditsRemaining ?? 0) > 0,
      hasApprovedPurchaseAfterPending:
        classification.hasApprovedPurchaseAfterPending,
      isAdaptationUnlocked: purchase.adaptation?.isUnlocked ?? false,
      eligibilityStatus: classification.status,
      eligibilityReason: classification.reason,
      relatedPendingPurchaseCount: groupPurchases.filter((entry) =>
        PENDING_STATUSES.has(entry.status),
      ).length,
      lastRecoveryEmailSentAt,
      recoveryEmailCount,
      ignored: Boolean(latestIgnored),
      ignoredAt: latestIgnored?.ignoredAt.toISOString() ?? null,
      ignoredByAdminUserId: latestIgnored?.ignoredByAdminId ?? null,
    };

    return { item, recoveryGroupKey, groupPurchaseIds };
  }

  private classifyPurchase(
    purchase: PurchaseRecord,
    indexes: EligibilityIndexes,
  ): {
    status: EligibilityStatus;
    reason: EligibilityReason;
    hasApprovedPurchaseAfterPending: boolean;
  } {
    if (TERMINAL_STATUSES.has(purchase.status)) {
      return {
        status: "not_eligible",
        reason: "terminal_purchase_status",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    if (!purchase.user) {
      return {
        status: "not_eligible",
        reason: "missing_user",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    if (!purchase.user.email || purchase.user.email.trim().length === 0) {
      return {
        status: "not_eligible",
        reason: "missing_user_email",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    if (purchase.status === "none" && !hasCheckoutEvidence(purchase)) {
      return {
        status: "not_eligible",
        reason: "missing_checkout_context",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    if (purchase.originAction === "unlock_cv") {
      return this.classifyUnlockCv(purchase, indexes);
    }

    if (purchase.originAction === "buy_credits") {
      return this.classifyBuyCredits(purchase, indexes);
    }

    return {
      status: "not_eligible",
      reason: "unsupported_origin_action",
      hasApprovedPurchaseAfterPending: false,
    };
  }

  private classifyUnlockCv(
    purchase: PurchaseRecord,
    indexes: EligibilityIndexes,
  ): {
    status: EligibilityStatus;
    reason: EligibilityReason;
    hasApprovedPurchaseAfterPending: boolean;
  } {
    if (!purchase.originAdaptationId) {
      return {
        status: "not_eligible",
        reason: "missing_adaptation_context",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    if (!purchase.adaptation) {
      return {
        status: "not_eligible",
        reason: "missing_adaptation_context",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    if (purchase.adaptation.isUnlocked) {
      return {
        status: "not_eligible",
        reason: "adaptation_already_unlocked",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    const lookupKey = `${purchase.userId}:${purchase.originAdaptationId}`;
    const completed =
      indexes.completedUnlockByUserAndAdaptation.get(lookupKey) ?? [];
    const hasApprovedSameAdaptation = completed.some(
      (candidate) => this.referenceDate(candidate) > this.referenceDate(purchase),
    );

    if (hasApprovedSameAdaptation) {
      return {
        status: "possibly_resolved",
        reason: "approved_purchase_after_pending_same_adaptation",
        hasApprovedPurchaseAfterPending: true,
      };
    }

    if ((purchase.user?.creditsRemaining ?? 0) > 0) {
      return {
        status: "possibly_resolved",
        reason: "user_has_available_credits",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    return {
      status: "eligible",
      reason: "pending_unlock_cv_not_unlocked",
      hasApprovedPurchaseAfterPending: false,
    };
  }

  private classifyBuyCredits(
    purchase: PurchaseRecord,
    indexes: EligibilityIndexes,
  ): {
    status: EligibilityStatus;
    reason: EligibilityReason;
    hasApprovedPurchaseAfterPending: boolean;
  } {
    const completed = indexes.completedByUser.get(purchase.userId) ?? [];
    const hasPosteriorCreditPurchase = completed.some(
      (candidate) =>
        candidate.creditsGranted > 0 &&
        this.referenceDate(candidate) > this.referenceDate(purchase),
    );

    if (hasPosteriorCreditPurchase) {
      return {
        status: "possibly_resolved",
        reason: "approved_purchase_after_pending",
        hasApprovedPurchaseAfterPending: true,
      };
    }

    if ((purchase.user?.creditsRemaining ?? 0) > 0) {
      return {
        status: "possibly_resolved",
        reason: "user_has_available_credits",
        hasApprovedPurchaseAfterPending: false,
      };
    }

    return {
      status: "eligible",
      reason: "pending_buy_credits_without_posterior_credit",
      hasApprovedPurchaseAfterPending: false,
    };
  }

  private groupCandidates(purchases: PurchaseRecord[]): GroupedCandidates[] {
    const byKey = new Map<string, PurchaseRecord[]>();

    for (const purchase of purchases) {
      const key = purchase.originAdaptationId
        ? `${purchase.userId}:${purchase.originAdaptationId}`
        : `${purchase.userId}:${purchase.originAction}`;
      const list = byKey.get(key) ?? [];
      list.push(purchase);
      byKey.set(key, list);
    }

    return [...byKey.values()]
      .map((group) => {
        const pendingInGroup = group.filter((purchase) =>
          PENDING_STATUSES.has(purchase.status),
        );
        if (pendingInGroup.length === 0) {
          return null;
        }
        const sortedPending = [...pendingInGroup].sort(sortByNewest);
        return {
          representative: sortedPending[0] as PurchaseRecord,
          groupPurchases: group,
          relatedPendingPurchaseCount: pendingInGroup.length,
        };
      })
      .filter((group): group is GroupedCandidates => group !== null)
      .sort((a, b) => sortByNewest(a.representative, b.representative));
  }

  private buildIndexes(purchases: PurchaseRecord[]): EligibilityIndexes {
    const completedByUser = new Map<string, PurchaseRecord[]>();
    const completedUnlockByUserAndAdaptation = new Map<string, PurchaseRecord[]>();

    for (const purchase of purchases) {
      if (purchase.status !== "completed") {
        continue;
      }

      const byUser = completedByUser.get(purchase.userId) ?? [];
      byUser.push(purchase);
      completedByUser.set(purchase.userId, byUser);

      if (purchase.originAction === "unlock_cv" && purchase.originAdaptationId) {
        const key = `${purchase.userId}:${purchase.originAdaptationId}`;
        const byCtx = completedUnlockByUserAndAdaptation.get(key) ?? [];
        byCtx.push(purchase);
        completedUnlockByUserAndAdaptation.set(key, byCtx);
      }
    }

    return {
      completedByUser,
      completedUnlockByUserAndAdaptation,
    };
  }

  private referenceDate(purchase: PurchaseRecord): number {
    return (purchase.paidAt ?? purchase.createdAt).getTime();
  }
}
