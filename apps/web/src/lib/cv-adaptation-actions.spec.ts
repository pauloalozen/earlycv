import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getHistoryActions,
  type HistoryAdaptationItem,
} from "./cv-adaptation-actions";

function buildItem(
  overrides: Partial<HistoryAdaptationItem> = {},
): HistoryAdaptationItem {
  return {
    id: "adapt-1",
    status: "awaiting_payment",
    paymentStatus: "pending",
    ...overrides,
  };
}

test("getHistoryActions returns result and download actions for completed adaptation", () => {
  const item = buildItem({ paymentStatus: "completed" });
  const actions = getHistoryActions(item);

  assert.deepEqual(actions, {
    canDownload: true,
    redeemHref: `/api/cv-adaptation/${item.id}/redeem-credit`,
    docxHref: `/api/cv-adaptation/${item.id}/download?format=docx`,
    pdfHref: `/api/cv-adaptation/${item.id}/download?format=pdf`,
    resultHref: `/adaptar/resultado?adaptationId=${item.id}`,
    canRedeem: false,
    isProcessing: false,
  });
});

test("getHistoryActions keeps download disabled before payment", () => {
  const item = buildItem({ paymentStatus: "pending" });
  const actions = getHistoryActions(item);

  assert.equal(actions.canDownload, false);
  assert.equal(actions.canRedeem, true);
  assert.equal(actions.isProcessing, false);
  assert.equal(
    actions.resultHref,
    `/adaptar/resultado?adaptationId=${item.id}`,
  );
});
