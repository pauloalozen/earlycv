import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getSuperadminDataErrorKind,
  isNextNotFoundError,
} from "./superadmin-errors";

test("getSuperadminDataErrorKind returns invalid-token for API 401 and 403 errors", () => {
  assert.equal(
    getSuperadminDataErrorKind(new Error("API 401: unauthorized")),
    "invalid-token",
  );
  assert.equal(
    getSuperadminDataErrorKind(new Error("API 403: forbidden")),
    "invalid-token",
  );
});

test("getSuperadminDataErrorKind returns unexpected-error for non-auth failures", () => {
  assert.equal(
    getSuperadminDataErrorKind(new Error("API 500: internal server error")),
    "unexpected-error",
  );
  assert.equal(
    getSuperadminDataErrorKind(new Error("network timeout")),
    "unexpected-error",
  );
});

test("isNextNotFoundError returns true for Next notFound errors", () => {
  assert.equal(
    isNextNotFoundError({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
    true,
  );
});

test("isNextNotFoundError returns false for other errors", () => {
  assert.equal(isNextNotFoundError(new Error("API 404: missing")), false);
  assert.equal(
    isNextNotFoundError({ digest: "NEXT_HTTP_ERROR_FALLBACK;500" }),
    false,
  );
});
