import { afterEach, describe, expect, it, vi } from "vitest";

const sendAdminPaymentRecoveryEmailMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/admin-payment-recovery-api", () => ({
  sendAdminPaymentRecoveryEmail: sendAdminPaymentRecoveryEmailMock,
  ignoreAdminPaymentRecoveryPurchase: vi.fn(),
  unignoreAdminPaymentRecoveryPurchase: vi.fn(),
}));

import { sendRecoveryEmailAction } from "./actions";

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
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/payment-recovery");
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
});
