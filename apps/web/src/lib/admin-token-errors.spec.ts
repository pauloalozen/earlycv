import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAdminDataErrorKind,
  isInvalidAdminTokenError,
  isMissingAdminRoleError,
} from "./admin-token-errors";

test("isInvalidAdminTokenError returns true for API 401 errors", () => {
  assert.equal(
    isInvalidAdminTokenError(new Error("API 401: unauthorized")),
    true,
  );
  assert.equal(
    isInvalidAdminTokenError(new Error("API 403: forbidden")),
    false,
  );
});

test("isMissingAdminRoleError returns true for API 403 errors", () => {
  assert.equal(isMissingAdminRoleError(new Error("API 403: forbidden")), true);
  assert.equal(
    isMissingAdminRoleError(new Error("API 401: unauthorized")),
    false,
  );
});

test("isInvalidAdminTokenError returns false for non-auth API errors", () => {
  assert.equal(isInvalidAdminTokenError(new Error("API 500: boom")), false);
  assert.equal(isInvalidAdminTokenError(new Error("network timeout")), false);
});

test("getAdminDataErrorKind distinguishes invalid token, missing role, and unexpected errors", () => {
  assert.equal(
    getAdminDataErrorKind(new Error("API 401: unauthorized")),
    "invalid-token",
  );
  assert.equal(
    getAdminDataErrorKind(new Error("API 403: forbidden")),
    "missing-role",
  );
  assert.equal(
    getAdminDataErrorKind(new Error("API 500: boom")),
    "unexpected-error",
  );
});
