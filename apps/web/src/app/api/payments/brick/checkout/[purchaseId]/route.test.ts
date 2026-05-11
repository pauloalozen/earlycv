import { describe, expect, it, vi } from "vitest";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-request", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

import { GET } from "./route";

describe("/api/payments/brick/checkout/[purchaseId] proxy", () => {
  it("preserves 401 from backend", async () => {
    apiRequestMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errorCode: "unauthorized", message: "Nao autenticado" }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    const response = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ purchaseId: "p1" }),
    });

    expect(response.status).toBe(401);
  });

  it("preserves 403/404/409 from backend", async () => {
    for (const status of [403, 404, 409]) {
      apiRequestMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ errorCode: `e_${status}` }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );

      const response = await GET(new Request("http://localhost/api"), {
        params: Promise.resolve({ purchaseId: "p1" }),
      });

      expect(response.status).toBe(status);
    }
  });
});
