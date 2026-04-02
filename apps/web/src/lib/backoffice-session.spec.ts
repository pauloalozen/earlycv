import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildBackofficeBootstrapRedirectUrl,
  buildBackofficeSessionResetHref,
} from "./backoffice-session";

test("buildBackofficeSessionResetHref encodes the next path", () => {
  assert.equal(
    buildBackofficeSessionResetHref("/superadmin/equipe?id=1"),
    "/backoffice/session/reset?next=%2Fsuperadmin%2Fequipe%3Fid%3D1",
  );
});

test("buildBackofficeBootstrapRedirectUrl removes only token from the URL", () => {
  assert.equal(
    buildBackofficeBootstrapRedirectUrl(
      "https://earlycv.dev/admin/usuarios?token=abc&query=paulo#section",
    ),
    "/admin/usuarios?query=paulo#section",
  );
});
