import { afterEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import { GET } from "./route";

describe("GET /api/payment-recovery/[token]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("forwards redirect response from api", async () => {
    process.env.API_URL = "https://api.earlycv.com.br";
    cookiesMock.mockResolvedValueOnce({
      get: vi.fn().mockReturnValue({ value: "access-token-1" }),
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://earlycv.com.br/entrar?tab=entrar&next=%2Ffoo",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/payment-recovery/token-1"),
      {
        params: Promise.resolve({ token: "token-1" }),
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://earlycv.com.br/entrar?tab=entrar&next=%2Ffoo",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.earlycv.com.br/api/payment-recovery/token-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token-1",
        }),
      }),
    );
  });

  it("returns not found for generic recovery redirect", async () => {
    process.env.API_URL = "https://api.earlycv.com.br";
    cookiesMock.mockResolvedValueOnce({
      get: vi.fn().mockReturnValue({ value: "access-token-1" }),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://earlycv.com.br/recuperar-pagamento",
          },
        }),
      ),
    );

    const response = await GET(
      new Request("http://localhost/api/payment-recovery/token-1"),
      {
        params: Promise.resolve({ token: "token-1" }),
      },
    );

    expect(response.status).toBe(404);
  });
});
