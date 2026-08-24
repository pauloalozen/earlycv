import { describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots", () => {
  it("keeps /radar crawlable", () => {
    const result = robots();
    const disallow = result.rules?.[0]?.disallow ?? [];

    expect(disallow).not.toContain("/radar");
    expect(disallow).not.toContain("/radar/*");
  });
});
