import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveSubscriptionContactEmail,
  resolveTopicSubscriptionChange,
  type SesSubscriptionEventPayload,
} from "./ses-subscription.util";

function event(input: {
  next: { all?: boolean; topics: Record<string, "OPT_IN" | "OPT_OUT"> };
  old?: { all?: boolean; topics: Record<string, "OPT_IN" | "OPT_OUT"> };
}): SesSubscriptionEventPayload {
  const toPrefs = (p: NonNullable<typeof input.next>) => ({
    unsubscribeAll: p.all ?? false,
    topicSubscriptionStatus: Object.entries(p.topics).map(
      ([topicName, subscriptionStatus]) => ({ topicName, subscriptionStatus }),
    ),
  });
  return {
    eventType: "Subscription",
    subscription: {
      source: "user@example.com",
      newTopicPreferences: toPrefs(input.next),
      ...(input.old ? { oldTopicPreferences: toPrefs(input.old) } : {}),
    },
  };
}

test("opt-out of one topic does not change the other topic (both listed in the payload)", () => {
  const payload = event({
    old: { topics: { "product-updates": "OPT_IN", relationship: "OPT_IN" } },
    next: { topics: { "product-updates": "OPT_OUT", relationship: "OPT_IN" } },
  });

  assert.equal(
    resolveTopicSubscriptionChange(payload, "product-updates"),
    "OPT_OUT",
  );
  // relationship continua OPT_IN e NÃO mudou — não pode virar "re-inscrição".
  assert.equal(resolveTopicSubscriptionChange(payload, "relationship"), null);
});

test("opt-out of relationship leaves product-updates untouched", () => {
  const payload = event({
    old: { topics: { "product-updates": "OPT_IN", relationship: "OPT_IN" } },
    next: { topics: { "product-updates": "OPT_IN", relationship: "OPT_OUT" } },
  });

  assert.equal(
    resolveTopicSubscriptionChange(payload, "relationship"),
    "OPT_OUT",
  );
  assert.equal(
    resolveTopicSubscriptionChange(payload, "product-updates"),
    null,
  );
});

test("unsubscribeAll opts out of every topic", () => {
  const payload = event({
    old: { topics: { "product-updates": "OPT_IN", relationship: "OPT_IN" } },
    next: {
      all: true,
      topics: { "product-updates": "OPT_IN", relationship: "OPT_IN" },
    },
  });

  assert.equal(
    resolveTopicSubscriptionChange(payload, "relationship"),
    "OPT_OUT",
  );
  assert.equal(
    resolveTopicSubscriptionChange(payload, "product-updates"),
    "OPT_OUT",
  );
});

test("re-subscribing to one topic reports OPT_IN for that topic only", () => {
  const payload = event({
    old: { topics: { "product-updates": "OPT_OUT", relationship: "OPT_OUT" } },
    next: { topics: { "product-updates": "OPT_OUT", relationship: "OPT_IN" } },
  });

  assert.equal(
    resolveTopicSubscriptionChange(payload, "relationship"),
    "OPT_IN",
  );
  assert.equal(
    resolveTopicSubscriptionChange(payload, "product-updates"),
    null,
  );
});

test("without oldTopicPreferences it reacts to the new state (original behavior)", () => {
  const payload = event({ next: { topics: { "product-updates": "OPT_OUT" } } });
  assert.equal(
    resolveTopicSubscriptionChange(payload, "product-updates"),
    "OPT_OUT",
  );
  assert.equal(resolveTopicSubscriptionChange(payload, "relationship"), null);
});

test("unknown topic / missing topic name / empty payload are ignored", () => {
  const payload = event({ next: { topics: { other: "OPT_OUT" } } });
  assert.equal(resolveTopicSubscriptionChange(payload, "relationship"), null);
  assert.equal(resolveTopicSubscriptionChange(payload, undefined), null);
  assert.equal(
    resolveTopicSubscriptionChange(
      { eventType: "Subscription" },
      "relationship",
    ),
    null,
  );
});

// Exemplo EXATO da documentação oficial da AWS (Subscription record).
const AWS_DOCS_SUBSCRIPTION_EVENT = {
  eventType: "Subscription" as const,
  mail: { destination: ["recipient@example.com"] },
  subscription: {
    contactList: "ContactListName",
    timestamp: "2022-01-12T01:00:17.910Z",
    source: "UnsubscribeHeader",
    newTopicPreferences: {
      unsubscribeAll: true,
      topicSubscriptionStatus: [
        { topicName: "ExampleTopicName", subscriptionStatus: "OptOut" },
      ],
    },
    oldTopicPreferences: {
      unsubscribeAll: false,
      topicSubscriptionStatus: [
        { topicName: "ExampleTopicName", subscriptionStatus: "OptOut" },
      ],
    },
  },
};

test("AWS docs example: contact is mail.destination[0]; source ('UnsubscribeHeader') is never taken as an e-mail", () => {
  assert.equal(
    resolveSubscriptionContactEmail(AWS_DOCS_SUBSCRIPTION_EVENT),
    "recipient@example.com",
  );
  assert.equal(
    resolveSubscriptionContactEmail({
      eventType: "Subscription",
      subscription: { source: "UnsubscribeHeader" },
    }),
    null,
  );
});

test("legacy shape (source is an e-mail) still resolves as a fallback", () => {
  assert.equal(
    resolveSubscriptionContactEmail({
      eventType: "Subscription",
      subscription: { source: "User@Example.com" },
    }),
    "user@example.com",
  );
});

test("AWS docs example: unsubscribeAll flipping to true opts out of the topic; 'OptOut'/'OptIn' spellings are understood", () => {
  assert.equal(
    resolveTopicSubscriptionChange(
      AWS_DOCS_SUBSCRIPTION_EVENT,
      "ExampleTopicName",
    ),
    "OPT_OUT",
  );

  const optIn = {
    eventType: "Subscription" as const,
    subscription: {
      source: "UnsubscribeHeader",
      newTopicPreferences: {
        unsubscribeAll: false,
        topicSubscriptionStatus: [
          { topicName: "t", subscriptionStatus: "OptIn" },
        ],
      },
      oldTopicPreferences: {
        unsubscribeAll: false,
        topicSubscriptionStatus: [
          { topicName: "t", subscriptionStatus: "OptOut" },
        ],
      },
    },
  };
  assert.equal(resolveTopicSubscriptionChange(optIn, "t"), "OPT_IN");
});
