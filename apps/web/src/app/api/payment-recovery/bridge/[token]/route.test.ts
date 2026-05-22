import { afterEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import { GET } from "./route";

describe("GET /api/payment-recovery/bridge/[token]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("forwards bridge redirect response from api", async () => {
    process.env.API_URL = "https://api.earlycv.com.br";
    cookiesMock.mockResolvedValueOnce({
      get: vi.fn().mockReturnValue({ value: "access-token-1" }),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://www.mercadopago.com.br/checkout/v1/redirect",
          },
        }),
      );
    vi.stubGlobal(
      "fetch",
      fetchMock,
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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.earlycv.com.br/api/payment-recovery/bridge/token-2",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token-1",
        }),
      }),
    );
  });

  it("redirects to generic recovery page when bridge token is invalid", async () => {
    process.env.API_URL = "https://api.earlycv.com.br";
    cookiesMock.mockResolvedValueOnce({
      get: vi.fn().mockReturnValue({ value: "access-token-1" }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Token invalido." }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await GET(
      new Request("http://localhost/api/payment-recovery/bridge/token-2"),
      {
        params: Promise.resolve({ token: "token-2" }),
      },
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/recuperar-pagamento?status=token-invalido",
    );
  });
});
