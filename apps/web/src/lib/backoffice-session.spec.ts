import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BACKOFFICE_SESSION_COOKIE_NAME,
  buildBackofficeBootstrapRedirectUrl,
} from "./backoffice-session.ts";

test("buildBackofficeBootstrapRedirectUrl removes token and keeps unrelated query params", () => {
  assert.equal(
    buildBackofficeBootstrapRedirectUrl(
      "https://earlycv.test/admin/ingestion?token=abc123&status=success&step=job-source",
    ),
    "/admin/ingestion?status=success&step=job-source",
  );
});

test("buildBackofficeBootstrapRedirectUrl returns pathname when token is the only query param", () => {
  assert.equal(
    buildBackofficeBootstrapRedirectUrl(
      "https://earlycv.test/superadmin/equipe?token=abc123",
    ),
    "/superadmin/equipe",
  );
});

test("buildBackofficeBootstrapRedirectUrl preserves hash fragments", () => {
  assert.equal(
    buildBackofficeBootstrapRedirectUrl(
      "https://earlycv.test/admin?page=2&token=abc123#metrics",
    ),
    "/admin?page=2#metrics",
  );
});

test("BACKOFFICE_SESSION_COOKIE_NAME stays stable for middleware and server helpers", () => {
  assert.equal(BACKOFFICE_SESSION_COOKIE_NAME, "earlycv-backoffice-session");
});
