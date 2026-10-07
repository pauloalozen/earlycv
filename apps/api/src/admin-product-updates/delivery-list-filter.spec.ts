import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDeliveryListWhere,
  eventTypeForFilter,
  summarizeEventMetadata,
} from "./delivery-list-filter";

test("sem filtro lista todas as entregas da campanha", () => {
  assert.deepEqual(buildDeliveryListWhere("pu-1", undefined), {
    productUpdateId: "pu-1",
  });
});

test("filtros de status usam o status da entrega, como os cards", () => {
  assert.deepEqual(buildDeliveryListWhere("pu-1", "sent"), {
    productUpdateId: "pu-1",
    status: "SENT",
  });
  assert.deepEqual(buildDeliveryListWhere("pu-1", "outcome_unknown"), {
    productUpdateId: "pu-1",
    status: "OUTCOME_UNKNOWN",
  });
});

test("filtros de evento pegam entregas com pelo menos um evento do tipo", () => {
  assert.deepEqual(buildDeliveryListWhere("pu-1", "clicked"), {
    productUpdateId: "pu-1",
    events: { some: { type: "CLICKED" } },
  });
  assert.equal(eventTypeForFilter("opened"), "OPENED");
  assert.equal(eventTypeForFilter("sent"), null);
  assert.equal(eventTypeForFilter(undefined), null);
});

test("descadastrados usam o mesmo critério do card (opt-out SES atual)", () => {
  assert.deepEqual(buildDeliveryListWhere("pu-1", "unsubscribed"), {
    productUpdateId: "pu-1",
    user: {
      productEmailSubscription: {
        subscribed: false,
        suppressionReason: "SES_OPT_OUT",
      },
    },
  });
});

test("resume o payload SES sem expor o JSON cru", () => {
  assert.equal(
    summarizeEventMetadata("CLICKED", {
      click: { link: "https://earlycv.com.br/x" },
      mail: { headers: [] },
    }),
    "https://earlycv.com.br/x",
  );
  assert.equal(
    summarizeEventMetadata("BOUNCED", {
      bounce: { bounceType: "Permanent", bounceSubType: "General" },
    }),
    "Permanent / General",
  );
  assert.equal(
    summarizeEventMetadata("COMPLAINED", {
      complaint: { complaintFeedbackType: "abuse" },
    }),
    "abuse",
  );
  assert.equal(summarizeEventMetadata("OPENED", { open: {} }), null);
  assert.equal(summarizeEventMetadata("CLICKED", null), null);
});
