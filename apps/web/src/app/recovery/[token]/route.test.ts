import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /recovery/[token]", () => {
  it("redirects to internal api payment recovery route", async () => {
    const response = await GET(new Request("http://localhost/recovery/abc?utm=mail"), {
      params: Promise.resolve({ token: "abc" }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/api/payment-recovery/abc?utm=mail",
    );
  });
});
