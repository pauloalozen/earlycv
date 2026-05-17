import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

describe("legacy jobs proxy", () => {
  it("redirects /jobs traffic to landing page", () => {
    const request = {
      url: "https://www.earlycv.com.br/jobs/programador-nestle",
    };

    const response = proxy(request as never);

    expect(config.matcher).toContain("/jobs/:path*");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.earlycv.com.br/",
    );
  });
});
