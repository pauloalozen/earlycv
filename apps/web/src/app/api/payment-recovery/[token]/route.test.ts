import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("GET /api/payment-recovery/[token]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("forwards redirect response from api", async () => {
    process.env.API_URL = "https://api.earlycv.com.br";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://earlycv.com.br/entrar?tab=entrar&next=%2Ffoo",
          },
        }),
      ),
    );

    const response = await GET(new Request("http://localhost/api/payment-recovery/token-1"), {
      params: Promise.resolve({ token: "token-1" }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://earlycv.com.br/entrar?tab=entrar&next=%2Ffoo",
    );
  });
});
