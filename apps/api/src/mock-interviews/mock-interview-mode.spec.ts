import "reflect-metadata";

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { NotFoundException } from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../common/authenticated-user.decorator";
import {
  canAccessMockInterview,
  getMockInterviewMode,
} from "./mock-interview.config";
import { MockInterviewsController } from "./mock-interviews.controller";

const savedMode = process.env.MOCK_INTERVIEW_MODE;
afterEach(() => {
  if (savedMode === undefined) delete process.env.MOCK_INTERVIEW_MODE;
  else process.env.MOCK_INTERVIEW_MODE = savedMode;
});

const customer = { isStaff: false, internalRole: "none" } as const;
const admin = { isStaff: true, internalRole: "admin" } as const;
const superadmin = { isStaff: true, internalRole: "superadmin" } as const;
// Papel sem a flag de staff não conta (mesma regra do RolesGuard).
const roleWithoutStaff = { isStaff: false, internalRole: "admin" } as const;

test("MOCK_INTERVIEW_MODE: missing or invalid is off", () => {
  delete process.env.MOCK_INTERVIEW_MODE;
  assert.equal(getMockInterviewMode(), "off");
  for (const raw of ["", "true", "ON ", "Admin", "garbage"]) {
    process.env.MOCK_INTERVIEW_MODE = raw;
    const expected = raw.trim().toLowerCase();
    assert.equal(
      getMockInterviewMode(),
      expected === "on" || expected === "admin" ? expected : "off",
    );
  }
});

test("off: nobody; admin: only staff admin/superadmin; on: everyone", () => {
  for (const viewer of [null, customer, admin, superadmin, roleWithoutStaff]) {
    assert.equal(canAccessMockInterview(viewer, "off"), false);
    assert.equal(canAccessMockInterview(viewer, "on"), true);
  }
  assert.equal(canAccessMockInterview(null, "admin"), false);
  assert.equal(canAccessMockInterview(customer, "admin"), false);
  assert.equal(canAccessMockInterview(roleWithoutStaff, "admin"), false);
  assert.equal(canAccessMockInterview(admin, "admin"), true);
  assert.equal(canAccessMockInterview(superadmin, "admin"), true);
});

function controller() {
  const calls: string[] = [];
  const service = {
    getOffer: () => (calls.push("offer"), { amountInCents: 7990 }),
    createCheckout: async () => (calls.push("checkout"), { purchaseId: "p1" }),
    getBrickCheckout: async () => (calls.push("brick"), {}),
    payWithBrick: async () => (calls.push("pay"), {}),
    listMine: async () => (calls.push("listMine"), []),
    getMine: async () => (calls.push("getMine"), {}),
    handleWebhook: async () => (calls.push("webhook"), {}),
  };
  return { ctrl: new MockInterviewsController(service as never), calls };
}

function asUser(viewer: typeof customer | typeof admin) {
  return { id: "u1", ...viewer } as unknown as AuthenticatedRequestUser;
}

async function sellingEndpoints(
  ctrl: MockInterviewsController,
  user: AuthenticatedRequestUser | null,
) {
  return [
    () => ctrl.offer(user),
    () =>
      ctrl.checkout(
        user as AuthenticatedRequestUser,
        {
          acceptPolicy: true,
        } as never,
      ),
    () => ctrl.brickCheckout(user as AuthenticatedRequestUser, "p1"),
    () => ctrl.brickPay(user as AuthenticatedRequestUser, "p1", {}),
  ];
}

test("selling endpoints answer 404 when the sale is closed for the viewer", async () => {
  const cases: [string, AuthenticatedRequestUser | null][] = [
    ["off", asUser(admin)],
    ["admin", asUser(customer)],
    ["admin", null],
  ];
  for (const [mode, user] of cases) {
    process.env.MOCK_INTERVIEW_MODE = mode;
    const { ctrl, calls } = controller();
    for (const call of await sellingEndpoints(ctrl, user)) {
      await assert.rejects(async () => call(), NotFoundException);
    }
    assert.deepEqual(calls, []);
  }
});

test("selling endpoints work for staff in admin mode and for anyone when on", async () => {
  const cases: [string, AuthenticatedRequestUser | null][] = [
    ["admin", asUser(admin)],
    ["on", asUser(customer)],
  ];
  for (const [mode, user] of cases) {
    process.env.MOCK_INTERVIEW_MODE = mode;
    const { ctrl, calls } = controller();
    for (const call of await sellingEndpoints(ctrl, user)) await call();
    assert.deepEqual(calls, ["offer", "checkout", "brick", "pay"]);
  }
  process.env.MOCK_INTERVIEW_MODE = "on";
  const { ctrl } = controller();
  await ctrl.offer(null);
});

test("existing orders and the webhook keep working with the sale off", async () => {
  process.env.MOCK_INTERVIEW_MODE = "off";
  const { ctrl, calls } = controller();
  const user = asUser(customer);
  await ctrl.listMine(user);
  await ctrl.getMine(user, "p1", {} as never);
  await ctrl.webhook({});
  assert.deepEqual(calls, ["listMine", "getMine", "webhook"]);
});

test("the offer e-mail is only enqueued with the sale open to everyone", async () => {
  const { JobApplicationsService } = await import(
    "../job-applications/job-applications.service"
  );
  const savedPrice = process.env.PRICE_INTERVIEW_SIM;
  process.env.PRICE_INTERVIEW_SIM = "7990";
  try {
    for (const [mode, expected] of [
      ["off", 0],
      ["admin", 0],
      ["on", 1],
    ] as const) {
      process.env.MOCK_INTERVIEW_MODE = mode;
      const enqueued: unknown[] = [];
      const service = new JobApplicationsService({} as never, {} as never, {
        enqueueMockInterviewOffer: async (x: unknown) => enqueued.push(x),
      });
      (
        service as unknown as {
          offerMockInterview: (a: Record<string, string>) => void;
        }
      ).offerMockInterview({
        id: "app-1",
        userId: "u1",
        jobTitle: "Dev",
        companyName: "ACME",
      });
      assert.equal(enqueued.length, expected, `mode ${mode}`);
    }
  } finally {
    if (savedPrice === undefined) delete process.env.PRICE_INTERVIEW_SIM;
    else process.env.PRICE_INTERVIEW_SIM = savedPrice;
  }
});
