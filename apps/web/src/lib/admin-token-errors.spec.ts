import assert from "node:assert/strict";
import { test } from "node:test";

import { isInvalidAdminTokenError } from "./admin-token-errors";

test("isInvalidAdminTokenError returns true for API 401 and 403 errors", () => {
  assert.equal(
    isInvalidAdminTokenError(new Error("API 401: unauthorized")),
    true,
  );
  assert.equal(isInvalidAdminTokenError(new Error("API 403: forbidden")), true);
});

test("isInvalidAdminTokenError returns false for non-auth API errors", () => {
  assert.equal(isInvalidAdminTokenError(new Error("API 500: boom")), false);
  assert.equal(isInvalidAdminTokenError(new Error("network timeout")), false);
});
