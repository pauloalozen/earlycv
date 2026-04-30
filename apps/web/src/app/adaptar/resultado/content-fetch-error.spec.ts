import test from "node:test";
import assert from "node:assert/strict";

import { buildContentFetchErrorMessage } from "./content-fetch-error";

test("includes HTTP status and upstream message when available", () => {
  const message = buildContentFetchErrorMessage(
    401,
    JSON.stringify({ message: "Unauthorized" }),
  );

  assert.equal(
    message,
    "Não foi possível carregar essa análise agora. [HTTP 401] Unauthorized",
  );
});

test("falls back to status code only when body is empty", () => {
  const message = buildContentFetchErrorMessage(500, "");

  assert.equal(message, "Não foi possível carregar essa análise agora. [HTTP 500]");
});
