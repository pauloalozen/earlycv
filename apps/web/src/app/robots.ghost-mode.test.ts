import { afterEach, describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots ghost mode", () => {
  const originalJobsGhost = process.env.JOBS_GHOST_MODE;
  const originalPublicJobsGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  afterEach(() => {
    process.env.JOBS_GHOST_MODE = originalJobsGhost;
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = originalPublicJobsGhost;
  });

  it("adds /radar disallow rules when ghost mode is enabled", () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";

    const result = robots();
    const disallow = result.rules?.[0]?.disallow ?? [];

    expect(disallow).toContain("/radar");
    expect(disallow).toContain("/radar/*");
  });

  it("keeps /radar crawlable when ghost mode is disabled", () => {
    process.env.JOBS_GHOST_MODE = "false";
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";

    const result = robots();
    const disallow = result.rules?.[0]?.disallow ?? [];

    expect(disallow).not.toContain("/radar");
    expect(disallow).not.toContain("/radar/*");
  });
});
