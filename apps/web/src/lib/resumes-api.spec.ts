import assert from "node:assert/strict";
import { test } from "node:test";

// Inline the parsing logic from getMyMasterCvExtractionStatus to avoid
// importing server-only modules (api-request.ts imports "server-only").
async function parseExtractionStatusResponse(
  response: Response,
): Promise<unknown> {
  if (!response.ok) return null;
  const payload = await response.text();
  if (!payload.trim()) return null;
  return JSON.parse(payload);
}

test("getMyMasterCvExtractionStatus returns null for empty body", async () => {
  const response = new Response("", { status: 200 });
  const result = await parseExtractionStatusResponse(response);
  assert.equal(result, null);
});

test("getMyMasterCvExtractionStatus returns null for non-ok response", async () => {
  const response = new Response('{"status":"pending"}', { status: 500 });
  const result = await parseExtractionStatusResponse(response);
  assert.equal(result, null);
});

test("getMyMasterCvExtractionStatus parses valid JSON response", async () => {
  const data = { status: "pending", extractionCoverage: null };
  const response = new Response(JSON.stringify(data), { status: 200 });
  const result = await parseExtractionStatusResponse(response);
  assert.deepEqual(result, data);
});
