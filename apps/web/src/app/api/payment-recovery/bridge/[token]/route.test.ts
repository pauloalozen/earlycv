import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/payment-recovery/bridge/[token]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("forwards bridge redirect response from api", async () => {
    process.env.API_URL = "https://api.earlycv.com.br";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://www.mercadopago.com.br/checkout/v1/redirect" },
        }),
      ),
    );

    const response = await GET(
      new Request("http://localhost/api/payment-recovery/bridge/token-2"),
      {
        params: Promise.resolve({ token: "token-2" }),
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://www.mercadopago.com.br/checkout/v1/redirect",
    );
  });
});
