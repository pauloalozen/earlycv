import { describe, expect, it, vi } from "vitest";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const createPlanCheckoutMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

vi.mock("@/lib/plans-api", () => ({
  createPlanCheckout: createPlanCheckoutMock,
}));

import { POST } from "./route";

describe("POST /api/plans/checkout", () => {
  it("returns 401 when user is not authenticated", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/plans/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "pro" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "unauthorized" });
  });

  it("returns 400 for invalid planId", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce({ id: "u1" });

    const response = await POST(
      new Request("http://localhost/api/plans/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "enterprise" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "plano-invalido" });
    expect(createPlanCheckoutMock).not.toHaveBeenCalled();
  });

  it("returns checkoutUrl and purchaseId for valid payload", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce({ id: "u1" });
    createPlanCheckoutMock.mockResolvedValueOnce({
      checkoutUrl: "https://mp.example/checkout",
      purchaseId: "purchase_123",
    });

    const response = await POST(
      new Request("http://localhost/api/plans/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "pro", adaptationId: " a1 " }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checkoutUrl: "https://mp.example/checkout",
      purchaseId: "purchase_123",
    });
    expect(createPlanCheckoutMock).toHaveBeenCalledWith("pro", "a1");
  });

  it("returns 502 when checkout creation fails", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce({ id: "u1" });
    createPlanCheckoutMock.mockRejectedValueOnce(new Error("boom"));

    const response = await POST(
      new Request("http://localhost/api/plans/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "pro" }),
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ message: "checkout-failed" });
  });
});
