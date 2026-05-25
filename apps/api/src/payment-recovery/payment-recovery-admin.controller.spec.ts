import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { PaymentRecoveryAdminController } from "./payment-recovery-admin.controller";

type AdminControllerDeps = ConstructorParameters<
  typeof PaymentRecoveryAdminController
>;

test("payment recovery admin controller enforces admin/superadmin guards", () => {
  const guards =
    Reflect.getMetadata(GUARDS_METADATA, PaymentRecoveryAdminController) ?? [];
  const roles =
    Reflect.getMetadata(INTERNAL_ROLES_KEY, PaymentRecoveryAdminController) ??
    [];

  assert.equal(Array.isArray(guards), true);
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("listPending forwards default filters and emits list viewed event", async () => {
  let capturedFilters: Record<string, unknown> | null = null;
  let listViewedCall: Record<string, unknown> | null = null;
  const controller = new PaymentRecoveryAdminController(
    {
      listPending: async (filters: Record<string, unknown>) => {
        capturedFilters = filters;
        return { items: [], total: 0, page: 1, pageSize: 20 };
      },
    } as AdminControllerDeps[0],
    {
      ignore: async () => [],
      unignore: async () => undefined,
    } as AdminControllerDeps[1],
    { isAdminEnabled: () => true } as AdminControllerDeps[2],
    {
      listViewed: (input: Record<string, unknown>) => {
        listViewedCall = input;
      },
      ignored: () => undefined,
      unignored: () => undefined,
    } as AdminControllerDeps[3],
    { send: async () => ({}) } as AdminControllerDeps[4],
  );

  await controller.listPending(
    {
      id: "admin-1",
    } as Parameters<PaymentRecoveryAdminController["listPending"]>[0],
    {},
  );

  assert.deepEqual(capturedFilters, {
    eligibilityStatus: "eligible",
    originAction: "all",
    alreadySent: "all",
    hasAvailableCredits: "all",
    ignored: "false",
    dateFrom: undefined,
    dateTo: undefined,
    search: undefined,
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(listViewedCall, {
    adminUserId: "admin-1",
    filters: capturedFilters,
  });
});

test("listPending supports all requested filters and pagination", async () => {
  let capturedFilters: Record<string, unknown> | null = null;
  const controller = new PaymentRecoveryAdminController(
    {
      listPending: async (filters: Record<string, unknown>) => {
        capturedFilters = filters;
        return { items: [], total: 0, page: 2, pageSize: 50 };
      },
    } as AdminControllerDeps[0],
    {
      ignore: async () => [],
      unignore: async () => undefined,
    } as AdminControllerDeps[1],
    { isAdminEnabled: () => true } as AdminControllerDeps[2],
    {
      listViewed: () => undefined,
      ignored: () => undefined,
      unignored: () => undefined,
    } as AdminControllerDeps[3],
    { send: async () => ({}) } as AdminControllerDeps[4],
  );

  await controller.listPending(
    { id: "admin-1" } as Parameters<
      PaymentRecoveryAdminController["listPending"]
    >[0],
    {
      eligibilityStatus: "possibly_resolved",
      originAction: "unlock_cv",
      alreadySent: "false",
      hasAvailableCredits: "true",
      ignored: "all",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-30",
      search: "john@example.com",
      page: 2,
      pageSize: 50,
    },
  );

  assert.deepEqual(capturedFilters, {
    eligibilityStatus: "possibly_resolved",
    originAction: "unlock_cv",
    alreadySent: "false",
    hasAvailableCredits: "true",
    ignored: "all",
    dateFrom: "2026-05-01",
    dateTo: "2026-05-30",
    search: "john@example.com",
    page: 2,
    pageSize: 50,
  });
});

test("ignore and unignore delegate persistence and emit events", async () => {
  const calls: string[] = [];
  const controller = new PaymentRecoveryAdminController(
    {
      listPending: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as AdminControllerDeps[0],
    {
      ignore: async (input: Record<string, unknown>) => {
        calls.push(`ignore:${JSON.stringify(input)}`);
      },
      unignore: async (input: Record<string, unknown>) => {
        calls.push(`unignore:${JSON.stringify(input)}`);
      },
    } as AdminControllerDeps[1],
    { isAdminEnabled: () => true } as AdminControllerDeps[2],
    {
      listViewed: () => undefined,
      ignored: (input: Record<string, unknown>) => {
        calls.push(`event-ignored:${JSON.stringify(input)}`);
      },
      unignored: (input: Record<string, unknown>) => {
        calls.push(`event-unignored:${JSON.stringify(input)}`);
      },
    } as AdminControllerDeps[3],
    { send: async () => ({}) } as AdminControllerDeps[4],
  );

  await controller.ignore(
    "purchase-1",
    { id: "admin-1" } as Parameters<
      PaymentRecoveryAdminController["ignore"]
    >[1],
    {
      reason: "false positive",
    },
  );
  await controller.unignore("purchase-1", { id: "admin-1" } as Parameters<
    PaymentRecoveryAdminController["unignore"]
  >[1]);

  assert.equal(
    calls.some((value) => value.includes("ignore")),
    true,
  );
  assert.equal(
    calls.some((value) => value.includes("unignore")),
    true,
  );
  assert.equal(
    calls.some((value) => value.includes("event-ignored")),
    true,
  );
  assert.equal(
    calls.some((value) => value.includes("event-unignored")),
    true,
  );
});

test("listPending fails closed when admin feature is disabled", async () => {
  const controller = new PaymentRecoveryAdminController(
    {
      listPending: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as AdminControllerDeps[0],
    {
      ignore: async () => [],
      unignore: async () => undefined,
    } as AdminControllerDeps[1],
    { isAdminEnabled: () => false } as AdminControllerDeps[2],
    {
      listViewed: () => undefined,
      ignored: () => undefined,
      unignored: () => undefined,
    } as AdminControllerDeps[3],
    { send: async () => ({}) } as AdminControllerDeps[4],
  );

  await assert.rejects(
    async () => {
      await controller.listPending(
        { id: "admin-1" } as Parameters<
          PaymentRecoveryAdminController["listPending"]
        >[0],
        {},
      );
    },
    {
      name: "ForbiddenException",
    },
  );
});

test("sendEmail returns required fields and emits events with correct payload", async () => {
  const calls: string[] = [];
  const controller = new PaymentRecoveryAdminController(
    {
      listPending: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    } as AdminControllerDeps[0],
    {
      ignore: async () => [],
      unignore: async () => undefined,
    } as AdminControllerDeps[1],
    { isAdminEnabled: () => true } as AdminControllerDeps[2],
    {
      listViewed: () => undefined,
      ignored: () => undefined,
      unignored: () => undefined,
      emailSendRequested: (input: Record<string, unknown>) =>
        calls.push(
          `payment_recovery_email_send_requested:${JSON.stringify(input)}`,
        ),
      emailSent: (input: Record<string, unknown>) =>
        calls.push(`payment_recovery_email_sent:${JSON.stringify(input)}`),
      emailSkipped: (input: Record<string, unknown>) =>
        calls.push(`payment_recovery_email_skipped:${JSON.stringify(input)}`),
      emailFailed: (input: Record<string, unknown>) =>
        calls.push(`payment_recovery_email_failed:${JSON.stringify(input)}`),
    } as AdminControllerDeps[3],
    {
      send: async () => ({
        success: true,
        status: "skipped",
        reason: "email_disabled",
        dryRun: true,
        allowlistMatched: false,
        realEmailSent: false,
        emailRecordId: "email-1",
        tokenExpiresAt: "2026-06-01T00:00:00.000Z",
        eligibilityStatus: "eligible",
        eligibilityReason: "pending_unlock_cv_not_unlocked",
      }),
    } as AdminControllerDeps[4],
  );

  const result = await controller.sendEmail("purchase-1", {
    id: "admin-1",
  } as Parameters<PaymentRecoveryAdminController["sendEmail"]>[1]);

  assert.deepEqual(result, {
    success: true,
    status: "skipped",
    reason: "email_disabled",
    dryRun: true,
    allowlistMatched: false,
    realEmailSent: false,
    emailRecordId: "email-1",
    tokenExpiresAt: "2026-06-01T00:00:00.000Z",
    eligibilityStatus: "eligible",
    eligibilityReason: "pending_unlock_cv_not_unlocked",
  });
  assert.equal(
    calls.some((entry) =>
      entry.includes("payment_recovery_email_send_requested"),
    ),
    true,
  );
  assert.equal(
    calls.some((entry) => entry.includes('eligibilityStatus":"eligible"')),
    true,
  );
  assert.equal(
    calls.some((entry) =>
      entry.includes('eligibilityReason":"pending_unlock_cv_not_unlocked"'),
    ),
    true,
  );
  assert.equal(
    calls.some((entry) => entry.includes("payment_recovery_email_skipped")),
    true,
  );
});
