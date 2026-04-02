import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPostRedirectResponse,
  createSessionTerminationResponse,
} from "./route-response";

test("createPostRedirectResponse uses 303 so form posts become GET navigations", () => {
  const response = createPostRedirectResponse(
    "https://earlycv.dev/auth/register",
    "/verificar-email",
  );

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://earlycv.dev/verificar-email",
  );
});

test("createSessionTerminationResponse clears app and backoffice cookies and redirects home", () => {
  const response = createSessionTerminationResponse(
    "https://earlycv.dev/backoffice/session/reset?next=%2Fadmin",
    "/",
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://earlycv.dev/");

  const cookieHeader = response.headers.get("set-cookie") ?? "";

  assert.match(cookieHeader, /earlycv-access-token=/);
  assert.match(cookieHeader, /earlycv-refresh-token=/);
  assert.match(cookieHeader, /earlycv-backoffice-session=/);
});
