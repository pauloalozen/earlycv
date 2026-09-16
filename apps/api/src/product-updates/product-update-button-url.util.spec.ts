import assert from "node:assert/strict";
import { test } from "node:test";

import { isSafeProductUpdateButtonUrl } from "./product-update-button-url.util";

test("accepts an absolute https URL", () => {
  assert.equal(
    isSafeProductUpdateButtonUrl("https://earlycv.com.br/monitor"),
    true,
  );
});

test("accepts an absolute https URL with a preserved query string", () => {
  assert.equal(
    isSafeProductUpdateButtonUrl(
      "https://earlycv.com.br/monitor?utm_source=email&utm_campaign=teste",
    ),
    true,
  );
});

test("rejects javascript: URIs", () => {
  assert.equal(isSafeProductUpdateButtonUrl("javascript:alert(1)"), false);
});

test("rejects data: URIs", () => {
  assert.equal(
    isSafeProductUpdateButtonUrl("data:text/html,<script>alert(1)</script>"),
    false,
  );
});

test("rejects a value that tries to break out of an HTML attribute", () => {
  assert.equal(
    isSafeProductUpdateButtonUrl(
      'https://earlycv.com.br/x" onmouseover="alert(1)',
    ),
    false,
  );
});

test("rejects a relative URL", () => {
  assert.equal(isSafeProductUpdateButtonUrl("/monitor"), false);
});

test("rejects plain http:// (only https is accepted)", () => {
  assert.equal(
    isSafeProductUpdateButtonUrl("http://earlycv.com.br/monitor"),
    false,
  );
});

test("rejects an invalid/unparseable string", () => {
  assert.equal(isSafeProductUpdateButtonUrl("not a url at all"), false);
});
