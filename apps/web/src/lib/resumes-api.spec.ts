import assert from "node:assert/strict";
import { test } from "node:test";

import { getMyMasterCvExtractionStatus } from "./resumes-api";

test("getMyMasterCvExtractionStatus returns null for empty body", async () => {
  globalThis.fetch = async () => new Response("", { status: 200 }) as Response;

  await assert.doesNotReject(async () => {
    const result = await getMyMasterCvExtractionStatus();
    assert.equal(result, null);
  });
});
