import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

describe("vagas proxy", () => {
  it("redirects /vagas traffic to landing page", () => {
    const request = { url: "https://www.earlycv.com.br/vagas/programador-nestle" };

    const response = proxy(request as never);

    expect(config.matcher).toContain("/vagas/:path*");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://www.earlycv.com.br/");
  });
});
