import { afterEach, describe, expect, it } from "vitest";

import robots from "./robots";

describe("robots ghost mode", () => {
  const originalJobsGhost = process.env.JOBS_GHOST_MODE;
  const originalPublicJobsGhost = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  afterEach(() => {
    process.env.JOBS_GHOST_MODE = originalJobsGhost;
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = originalPublicJobsGhost;
  });

  it("adds /vagas disallow rules when ghost mode is enabled", () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";

    const result = robots();
    const disallow = result.rules?.[0]?.disallow ?? [];

    expect(disallow).toContain("/vagas");
    expect(disallow).toContain("/vagas/*");
  });

  it("keeps /vagas crawlable when ghost mode is disabled", () => {
    process.env.JOBS_GHOST_MODE = "false";
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "false";

    const result = robots();
    const disallow = result.rules?.[0]?.disallow ?? [];

    expect(disallow).not.toContain("/vagas");
    expect(disallow).not.toContain("/vagas/*");
  });
});
