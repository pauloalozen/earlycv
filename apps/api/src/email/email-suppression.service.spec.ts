import assert from "node:assert/strict";
import { test } from "node:test";

import { createTable } from "../email-dispatch/email-dispatch.test-support";
import { EmailSuppressionService } from "./email-suppression.service";
import type { SesEventPayload } from "./ses-event.util";

function setup() {
  const emailSuppression = createTable({ uniqueKeys: ["email"] });
  // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  const service = new EmailSuppressionService({ emailSuppression } as any);
  return { service, emailSuppression };
}

const bounce = (
  bounceType: string,
  recipients = ["User@Example.com"],
  category = "JOB_ALERT",
): SesEventPayload => ({
  eventType: "Bounce",
  mail: { tags: { category: [category] } },
  bounce: {
    bounceType,
    bounceSubType: "General",
    timestamp: "2026-10-05T12:00:00.000Z",
    bouncedRecipients: recipients.map((emailAddress) => ({ emailAddress })),
  },
});

test("a PERMANENT bounce suppresses the address, whatever category generated it", async () => {
  const { service, emailSuppression } = setup();

  const result = await service.recordFromSesEvent(bounce("Permanent"), "evt-1");

  assert.equal(result.recorded, 1);
  assert.equal(emailSuppression.rows[0].email, "user@example.com");
  assert.equal(emailSuppression.rows[0].reason, "HARD_BOUNCE");
  assert.equal(emailSuppression.rows[0].sourceCategory, "JOB_ALERT");
  assert.deepEqual(await service.findByEmail("USER@example.com"), {
    reason: "HARD_BOUNCE",
  });
});

test("TRANSIENT and UNDETERMINED bounces never suppress", async () => {
  const { service, emailSuppression } = setup();

  assert.equal(
    (await service.recordFromSesEvent(bounce("Transient"), "e1")).recorded,
    0,
  );
  assert.equal(
    (await service.recordFromSesEvent(bounce("Undetermined"), "e2")).recorded,
    0,
  );
  assert.equal(
    (
      await service.recordFromSesEvent(
        { eventType: "Bounce", bounce: {} },
        "e3",
      )
    ).recorded,
    0,
  );
  assert.equal(emailSuppression.rows.length, 0);
  assert.equal(await service.findByEmail("user@example.com"), null);
});

test("a complaint suppresses and overrides a previous hard bounce; a later bounce never downgrades it", async () => {
  const { service, emailSuppression } = setup();

  await service.recordFromSesEvent(bounce("Permanent"), "e1");
  await service.recordFromSesEvent(
    {
      eventType: "Complaint",
      mail: { tags: { category: ["RELATIONSHIP"] } },
      complaint: {
        timestamp: "2026-10-06T12:00:00.000Z",
        complainedRecipients: [{ emailAddress: "user@example.com" }],
      },
    },
    "e2",
  );
  assert.equal(emailSuppression.rows[0].reason, "COMPLAINT");

  await service.recordFromSesEvent(bounce("Permanent"), "e3");
  assert.equal(emailSuppression.rows[0].reason, "COMPLAINT");
  assert.equal(emailSuppression.rows.length, 1);
});

test("other event types and events without recipients record nothing", async () => {
  const { service } = setup();

  assert.equal(
    (await service.recordFromSesEvent({ eventType: "Delivery" }, "e1"))
      .recorded,
    0,
  );
  assert.equal(
    (await service.recordFromSesEvent(bounce("Permanent", []), "e2")).recorded,
    0,
  );
});

test("only genuine hard-bounce subtypes suppress: General, NoEmail, Suppressed, OnAccountSuppressionList", async () => {
  for (const subType of [
    "General",
    "NoEmail",
    "Suppressed",
    "OnAccountSuppressionList",
  ]) {
    const { service, emailSuppression } = setup();
    const payload = bounce("Permanent");
    payload.bounce = { ...payload.bounce, bounceSubType: subType };
    assert.equal(
      (await service.recordFromSesEvent(payload, "e")).recorded,
      1,
      subType,
    );
    assert.equal(emailSuppression.rows.length, 1, subType);
  }

  for (const subType of [
    "EmailValidationSuppressed",
    "OnTenantSuppressionList",
    "Undetermined",
    "SomethingNew",
    "",
  ]) {
    const { service, emailSuppression } = setup();
    const payload = bounce("Permanent");
    payload.bounce = { ...payload.bounce, bounceSubType: subType };
    assert.equal(
      (await service.recordFromSesEvent(payload, "e")).recorded,
      0,
      subType,
    );
    assert.equal(emailSuppression.rows.length, 0, subType);
  }
});

test("a bounce that looks like SES refusing an UNSUBSCRIBED contact never suppresses the address for other categories", async () => {
  // Segundo a doc da AWS, enviar para contato descadastrado gera um evento
  // Bounce. Descadastro de UM tópico não pode virar hard bounce global.
  for (const diagnosticCode of [
    "Recipient unsubscribed from topic relationship",
    "contact list opt-out",
    "OPT_OUT for topic",
    "Contact is unsubscribed",
  ]) {
    const { service, emailSuppression } = setup();
    const payload = bounce("Permanent");
    payload.bounce = {
      ...payload.bounce,
      bouncedRecipients: [{ emailAddress: "user@example.com", diagnosticCode }],
    };
    assert.equal(
      (await service.recordFromSesEvent(payload, "e")).recorded,
      0,
      diagnosticCode,
    );
    assert.equal(emailSuppression.rows.length, 0, diagnosticCode);
  }

  // diagnóstico de rejeição real continua suprimindo
  const { service, emailSuppression } = setup();
  const payload = bounce("Permanent");
  payload.bounce = {
    ...payload.bounce,
    bouncedRecipients: [
      {
        emailAddress: "user@example.com",
        diagnosticCode: "smtp; 550 5.1.1 user unknown",
      },
    ],
  };
  assert.equal((await service.recordFromSesEvent(payload, "e")).recorded, 1);
  assert.equal(emailSuppression.rows.length, 1);
});

test("every Bounce decision is logged with type/subtype/category and a REDACTED diagnostic (no e-mail addresses), so the real opt-out bounce can be identified in production logs", async () => {
  const { service } = setup();
  const lines: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: logger privado no teste
  (service as any).logger = { log: (m: string) => lines.push(m) };

  const transient = bounce("Transient");
  await service.recordFromSesEvent(transient, "e1");

  const optOut = bounce("Permanent");
  optOut.bounce = {
    ...optOut.bounce,
    bouncedRecipients: [
      {
        emailAddress: "user@example.com",
        diagnosticCode:
          "Contact user@example.com is unsubscribed from topic relationship",
      },
    ],
  };
  await service.recordFromSesEvent(optOut, "e2");

  const hard = bounce("Permanent");
  await service.recordFromSesEvent(hard, "e3");

  assert.match(lines[0], /action=ignored reason=not_permanent/);
  assert.match(
    lines[1],
    /type=Permanent subtype=General category=JOB_ALERT action=ignored reason=optout_diagnostic/,
  );
  assert.ok(
    lines[1].includes(
      'diagnostic="Contact [email] is unsubscribed from topic relationship"',
    ),
  );
  assert.ok(lines.every((l) => !l.includes("@")));
  assert.ok(
    lines.some((l) =>
      l.startsWith("email suppression recorded: reason=HARD_BOUNCE"),
    ),
  );
});
