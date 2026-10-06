import { afterEach, describe, expect, it, vi } from "vitest";

const sendAdminPaymentRecoveryEmailMock = vi.hoisted(() => vi.fn());
const sendAdminPaymentRecoveryTestEmailMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/admin-payment-recovery-api", () => ({
  sendAdminPaymentRecoveryEmail: sendAdminPaymentRecoveryEmailMock,
  sendAdminPaymentRecoveryTestEmail: sendAdminPaymentRecoveryTestEmailMock,
  ignoreAdminPaymentRecoveryPurchase: vi.fn(),
  unignoreAdminPaymentRecoveryPurchase: vi.fn(),
}));

import {
  sendRecoveryEmailAction,
  sendRecoveryTestEmailAction,
} from "./actions";

describe("payment recovery actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns success kind when API status is sent", async () => {
    sendAdminPaymentRecoveryEmailMock.mockResolvedValueOnce({
      status: "sent",
      reason: "sent",
    });

    const result = await sendRecoveryEmailAction("purchase-1");

    expect(result.kind).toBe("success");
    expect(result.message).toMatch(/email enviado com sucesso/i);
    expect(sendAdminPaymentRecoveryEmailMock).toHaveBeenCalledWith(
      "purchase-1",
      false,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/payment-recovery");
  });

  it("forwards forceResend when requested", async () => {
    sendAdminPaymentRecoveryEmailMock.mockResolvedValueOnce({
      status: "sent",
      reason: "sent",
    });

    await sendRecoveryEmailAction("purchase-1", true);

    expect(sendAdminPaymentRecoveryEmailMock).toHaveBeenCalledWith(
      "purchase-1",
      true,
    );
  });

  it("returns error kind for skipped responses", async () => {
    sendAdminPaymentRecoveryEmailMock.mockResolvedValueOnce({
      status: "skipped",
      reason: "allowlist_blocked",
    });

    const result = await sendRecoveryEmailAction("purchase-1");

    expect(result.kind).toBe("error");
    expect(result.message).toMatch(/allowlist/i);
  });

  it("maps dry_run reason to dry-run message", async () => {
    sendAdminPaymentRecoveryEmailMock.mockResolvedValueOnce({
      status: "skipped",
      reason: "dry_run",
    });

    const result = await sendRecoveryEmailAction("purchase-1");

    expect(result.message).toMatch(/dry-run/i);
  });

  it("test email: rejects invalid email without calling API", async () => {
    const result = await sendRecoveryTestEmailAction("nao-e-email");

    expect(result.kind).toBe("error");
    expect(sendAdminPaymentRecoveryTestEmailMock).not.toHaveBeenCalled();
  });

  it("test email: returns API result for typed email", async () => {
    const apiResult = { status: "sent", to: "a@b.com" };
    sendAdminPaymentRecoveryTestEmailMock.mockResolvedValueOnce(apiResult);

    const result = await sendRecoveryTestEmailAction(" a@b.com ");

    expect(sendAdminPaymentRecoveryTestEmailMock).toHaveBeenCalledWith(
      "a@b.com",
    );
    expect(result).toEqual({ kind: "result", result: apiResult });
  });
});
