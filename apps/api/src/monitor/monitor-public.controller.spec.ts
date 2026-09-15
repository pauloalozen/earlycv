import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException, UnauthorizedException } from "@nestjs/common";

import { MonitorPublicController } from "./monitor-public.controller";

function createController(expectedTopicArn: string | undefined) {
  const webhookService = {
    processSesEvent: async () => ({ processed: true }),
  };
  const productUpdateWebhookService = {
    processSesEvent: async () => ({ processed: true }),
    processSubscriptionEvent: async () => ({ processed: true }),
  };
  const alertPreferenceService = {};
  const emailConfig = {
    getExpectedSnsTopicArn: () => expectedTopicArn,
  };

  return new MonitorPublicController(
    webhookService as never,
    productUpdateWebhookService as never,
    alertPreferenceService as never,
    emailConfig as never,
  );
}

function fakeRequest(body: unknown) {
  return { rawBody: Buffer.from(JSON.stringify(body), "utf8") } as never;
}

test("POST /monitor/webhooks/ses rejects when AWS_SES_SNS_TOPIC_ARN is not configured — refuses by default, never accepts an unauthenticated topic", async () => {
  const controller = createController(undefined);

  await assert.rejects(
    () =>
      controller.sesWebhook(
        fakeRequest({ TopicArn: "arn:aws:sns:us-east-1:123:topic" }),
      ),
    UnauthorizedException,
  );
});

test("POST /monitor/webhooks/ses rejects a message whose TopicArn does not match the configured one — before even checking the signature", async () => {
  const controller = createController(
    "arn:aws:sns:us-east-1:123:expected-topic",
  );

  await assert.rejects(
    () =>
      controller.sesWebhook(
        fakeRequest({ TopicArn: "arn:aws:sns:us-east-1:123:some-other-topic" }),
      ),
    UnauthorizedException,
  );
});

test("POST /monitor/webhooks/ses rejects when the raw body is missing", async () => {
  const controller = createController("arn:aws:sns:us-east-1:123:topic");

  await assert.rejects(
    () => controller.sesWebhook({ rawBody: undefined } as never),
    UnauthorizedException,
  );
});

test("POST /monitor/webhooks/ses rejects an unparseable body with 400 (malformed request), not 401 — never leaks into signature verification", async () => {
  const controller = createController("arn:aws:sns:us-east-1:123:topic");

  await assert.rejects(
    () =>
      controller.sesWebhook({
        rawBody: Buffer.from("not json", "utf8"),
      } as never),
    BadRequestException,
  );
});
