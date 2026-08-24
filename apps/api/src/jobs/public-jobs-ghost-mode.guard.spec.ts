import assert from "node:assert/strict";
import { test } from "node:test";

import { PublicJobsGhostModeGuard } from "./public-jobs-ghost-mode.guard";

test("always allows access regardless of role", () => {
  const guard = new PublicJobsGhostModeGuard();

  assert.equal(guard.canActivate(), true);
});
