import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const createPlanCheckoutMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

vi.mock("@/lib/plans-api", () => ({
  createPlanCheckout: createPlanCheckoutMock,
}));

import { GET, POST } from "./route";

describe("/plans/checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated GET to login preserving selected plan", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce(null);

    const response = await GET(
      new Request("http://localhost/plans/checkout?plan=pro"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/entrar?next=%2Fplans%2Fcheckout%3Fplan%3Dpro",
    );
    expect(createPlanCheckoutMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated GET to planos without creating checkout", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce({ id: "u1" });

    const response = await GET(
      new Request("http://localhost/plans/checkout?plan=starter"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/planos?plan=starter",
    );
    expect(createPlanCheckoutMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated GET keeping valid plan query for UI continuity", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce({ id: "u1" });

    const response = await GET(
      new Request("http://localhost/plans/checkout?plan=turbo"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/planos?plan=turbo",
    );
    expect(createPlanCheckoutMock).not.toHaveBeenCalled();
  });

  it("ignores direct MP env links and creates checkout on POST", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce({ id: "u1" });
    createPlanCheckoutMock.mockResolvedValueOnce({
      checkoutUrl: "https://mp.example/legacy",
      purchaseId: "purchase_999",
      checkoutMode: "brick",
    });

    const formData = new FormData();
    formData.set("planId", "pro");

    const response = await POST(
      new Request("http://localhost/plans/checkout", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/pagamento/checkout/purchase_999",
    );
    expect(createPlanCheckoutMock).toHaveBeenCalledWith("pro", undefined);
  });
});
