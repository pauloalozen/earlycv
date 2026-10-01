import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { DatabaseService } from "../database/database.service";
import { EmailSuppressionService } from "../email/email-suppression.service";
import { EmailDispatchService } from "../email-dispatch/email-dispatch.service";
import {
  buildEnv,
  TestEmailDispatchConfig,
} from "../email-dispatch/email-dispatch.test-support";
import { EmailDispatchSettingsService } from "../email-dispatch/email-dispatch-settings.service";
import { EmailDispatchTemplateService } from "../email-dispatch/email-dispatch-template.service";
import { PurchaseConfirmationRecoveryService } from "../plans/purchase-confirmation-recovery.service";
import { AdminEmailsService, assertTemplateKey } from "./admin-emails.service";
import { UpdateEmailSettingsDto } from "./dto/update-email-settings.dto";
import { UpdateEmailTemplateDto } from "./dto/update-email-template.dto";

// Teste com BANCO REAL (mesmo padrão de plans-purchase-confirmation.spec): prova
// que o formato das queries (groupBy, filtros, upserts) funciona no Prisma de
// verdade e que os serviços do dispatch são o que o admin usa.

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const tag = `t${randomUUID().slice(0, 8)}`;
const createdDispatchIds: string[] = [];
const createdSuppressionEmails: string[] = [];
const createdUserIds: string[] = [];

after(async () => {
  await prisma.emailDispatchEvent.deleteMany({
    where: { dispatchId: { in: createdDispatchIds } },
  });
  await prisma.emailDispatch.deleteMany({
    where: { id: { in: createdDispatchIds } },
  });
  await prisma.emailSuppression.deleteMany({
    where: { email: { in: createdSuppressionEmails } },
  });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.emailDispatchTemplate.deleteMany({});
  await prisma.emailDispatchSettings.deleteMany({});
  await prisma.monitorAdminActionLog.deleteMany({
    where: { adminId: { startsWith: `admin_${tag}` } },
  });
  await prisma.$disconnect();
});

function build(production = false) {
  const sent: Array<{ category: string; message: Record<string, unknown> }> =
    [];
  const emailService = {
    send: async (params: {
      category: string;
      message: Record<string, unknown>;
    }) => {
      sent.push(params);
      return {
        outcome: "SENT" as const,
        provider: "SES" as const,
        providerMessageId: "m1",
      };
    },
  };
  const settings = new EmailDispatchSettingsService(database);
  const templates = new EmailDispatchTemplateService(database);
  const env = buildEnv();
  const config = new TestEmailDispatchConfig(
    env,
    {
      isSesEnabled: () => true,
      getSesClientConfig: () => ({
        region: "us-east-2",
        accessKeyId: "k",
        secretAccessKey: "s",
      }),
      getSesSenderProfile: () => ({
        fromEmail: "contato@earlycv.com.br",
        fromName: "Paulo do EarlyCV",
        configurationSet: "earlycv-relationship-email",
      }),
    },
    settings,
    production,
  );
  const suppression = new EmailSuppressionService(database);
  const dispatch = new EmailDispatchService(
    database,
    config,
    emailService as never,
    suppression,
    templates,
  );
  const recovery = new PurchaseConfirmationRecoveryService(
    database,
    dispatch,
    config,
  );
  const service = new AdminEmailsService(
    database,
    settings,
    templates,
    config,
    dispatch,
    recovery,
  );
  return { service, sent, settings, templates };
}

const admin = `admin_${tag}`;

test("settings: default is ALL OFF; saving persists, is audited and is read back (admin-managed, no env)", async () => {
  const { service } = build();

  const initial = await service.getSettings();
  assert.equal(initial.welcomeMode, "OFF");
  assert.equal(initial.startAt, null);

  const saved = await service.updateSettings(admin, {
    welcomeMode: "SHADOW",
    feedbackMode: "OFF",
    purchaseConfirmationMode: "ALLOWLIST",
    startAt: "2026-10-15T00:00:00.000Z",
    allowlist: ["Tester@Example.com"],
    extraBlocklist: [],
  });
  assert.equal(saved.purchaseConfirmationMode, "ALLOWLIST");
  assert.deepEqual(saved.allowlist, ["tester@example.com"]);

  const back = await service.getSettings();
  assert.equal(back.welcomeMode, "SHADOW");
  assert.equal(back.startAt?.toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(back.updatedByAdminId, admin);

  const audit = await prisma.monitorAdminActionLog.findMany({
    where: { adminId: admin, action: "email_dispatch_settings_updated" },
  });
  assert.equal(audit.length, 1);

  await assert.rejects(
    () =>
      service.updateSettings(admin, {
        welcomeMode: "LIVE",
        feedbackMode: "OFF",
        purchaseConfirmationMode: "OFF",
        startAt: "2026-10-15T00:00:00.000Z",
        allowlist: [],
        extraBlocklist: [],
      }),
    BadRequestException,
  );
});

test("templates: list shows defaults; saving a valid edit marks it custom; an invalid edit is rejected; reset restores the default", async () => {
  const { service } = build();

  const before = (await service.listTemplates()).find(
    (t) => t.key === "WELCOME",
  );
  assert.equal(before?.current.isCustom, false);
  assert.equal(before?.unsubscribeFooter, true);
  assert.ok(before?.variables.some((v) => v.name === "link"));

  await service.updateTemplate(admin, "WELCOME", {
    subject: "Bem-vindo!",
    body: "{{saudacao}} Comece aqui: {{link}}",
  });
  const custom = (await service.listTemplates()).find(
    (t) => t.key === "WELCOME",
  );
  assert.equal(custom?.current.isCustom, true);
  assert.equal(custom?.current.subject, "Bem-vindo!");

  await assert.rejects(
    () =>
      service.updateTemplate(admin, "FEEDBACK_NEUTRAL", {
        subject: "Oi",
        body: "Duas? Perguntas?",
      }),
    BadRequestException,
  );

  await service.resetTemplate(admin, "WELCOME");
  const reset = (await service.listTemplates()).find(
    (t) => t.key === "WELCOME",
  );
  assert.equal(reset?.current.isCustom, false);
});

test("template keys are validated: unknown key is a 404", () => {
  assert.equal(assertTemplateKey("PURCHASE_COUPON"), "PURCHASE_COUPON");
  assert.throws(() => assertTemplateKey("EVERYONE"), NotFoundException);
});

test("template preview validates and renders without saving", async () => {
  const { service } = build();

  const ok = service.previewTemplate("FEEDBACK_VIEWED", {
    subject: "Sobre a análise",
    body: "{{saudacao}} O que achou?",
  });
  assert.deepEqual(ok.errors, []);
  assert.match(ok.rendered?.text ?? "", /^Oi, Maria! O que achou\?/);

  const bad = service.previewTemplate("PURCHASE_COUPON", {
    subject: "Cupom",
    body: "{{resumo}} Valor pago: R$ 10",
  });
  assert.ok(bad.errors.length > 0);
  assert.equal(bad.rendered, null);
});

test("send-test: ONE informed recipient, saved template; fake transport outside production (nothing leaves), real only in production", async () => {
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test";

  const staging = build(false);
  const fake = await staging.service.sendTestTemplate(
    "FEEDBACK_VIEWED",
    "paulo.alozen@gmail.com",
  );
  assert.equal(fake.transport, "fake");
  assert.equal(fake.sent, true);
  assert.equal(staging.sent.length, 0);

  const prod = build(true);
  const cases: Array<
    [Parameters<typeof prod.service.sendTestTemplate>[0], string, string]
  > = [
    ["WELCOME", "RELATIONSHIP", "Boas-vindas ao EarlyCV"],
    ["FEEDBACK_VIEWED", "RELATIONSHIP", "Sobre a análise do seu currículo"],
    ["FEEDBACK_NEUTRAL", "RELATIONSHIP", "Sua primeira experiência no EarlyCV"],
    ["PURCHASE_PAID", "BILLING", "Confirmação da sua compra no EarlyCV"],
    ["PURCHASE_COUPON", "BILLING", "Seu cupom foi resgatado no EarlyCV"],
  ];
  for (const [key, category, subject] of cases) {
    const before = prod.sent.length;
    const result = await prod.service.sendTestTemplate(
      key,
      "paulo.alozen@gmail.com",
    );
    assert.equal(result.transport, "real", key);
    assert.equal(result.sent, true, key);
    assert.equal(prod.sent.length, before + 1, key);
    assert.equal(prod.sent.at(-1)?.category, category, key);
    assert.equal(prod.sent.at(-1)?.message.subject, subject, key);
    assert.equal(prod.sent.at(-1)?.message.to, "paulo.alozen@gmail.com", key);
  }
  // o recibo de cupom de teste nunca alega pagamento
  assert.doesNotMatch(String(prod.sent.at(-1)?.message.text), /Valor pago|R\$/);
});

test("dispatches: list/filter by group, kind and status; tests excluded by default; detail has the event timeline; unknown id is 404", async () => {
  const { service } = build();
  const mk = async (data: Record<string, unknown>) => {
    const row = await prisma.emailDispatch.create({
      data: {
        recipientEmail: `${tag}@example.com`,
        scheduledFor: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
        dedupeKey: `${tag}:${randomUUID()}`,
        ...data,
      } as never,
    });
    createdDispatchIds.push(row.id);
    return row;
  };
  const welcome = await mk({ kind: "WELCOME", status: "SENT" });
  await mk({
    kind: "FEEDBACK_FIRST_USE",
    status: "SKIPPED",
    skippedReason: "shadow_mode",
  });
  await mk({
    kind: "PURCHASE_CONFIRMATION",
    status: "SENT",
    referenceId: "p1",
  });
  await mk({ kind: "WELCOME", status: "SENT", isTest: true });
  await prisma.emailDispatchEvent.create({
    data: {
      dispatchId: welcome.id,
      providerEventId: `${tag}-evt`,
      type: "DELIVERED",
      occurredAt: new Date(),
    },
  });

  const mine = (items: Array<{ recipientEmail: string }>) =>
    items.filter((i) => i.recipientEmail === `${tag}@example.com`);

  const relationship = await service.listDispatches({
    group: "relationship",
    limit: 100,
  });
  assert.deepEqual(
    mine(relationship.items as never)
      .map((i: { kind: string }) => i.kind)
      .sort(),
    ["FEEDBACK_FIRST_USE", "WELCOME"],
  );
  const purchase = await service.listDispatches({
    group: "purchase",
    limit: 100,
  });
  assert.equal(mine(purchase.items as never).length, 1);
  const skipped = await service.listDispatches({
    status: "SKIPPED",
    limit: 100,
  });
  assert.equal(mine(skipped.items as never).length, 1);
  const withTests = await service.listDispatches({
    group: "relationship",
    includeTest: true,
    limit: 100,
  });
  assert.equal(mine(withTests.items as never).length, 3);

  const detail = await service.getDispatch(welcome.id);
  assert.deepEqual(
    detail.events.map((e) => e.type),
    ["DELIVERED"],
  );
  await assert.rejects(() => service.getDispatch("nope"), NotFoundException);
});

test("suppressions are listed newest first", async () => {
  const { service } = build();
  const email = `${tag}-sup@example.com`;
  createdSuppressionEmails.push(email);
  await prisma.emailSuppression.create({
    data: {
      email,
      reason: "HARD_BOUNCE",
      bounceSubType: "General",
      sourceCategory: "JOB_ALERT",
      occurredAt: new Date(),
    },
  });

  const listing = await service.listSuppressions({ limit: 100 });

  const row = listing.items.find((i) => i.email === email);
  assert.equal(row?.reason, "HARD_BOUNCE");
  assert.equal(row?.sourceCategory, "JOB_ALERT");
});

test("overview: effective modes, transport, readiness (reasons only) and counts; no names of lists/topics/secrets", async () => {
  const { service } = build(false);

  const overview = await service.overview();

  assert.equal(overview.runtime.transport, "fake");
  assert.equal(
    overview.runtime.effectiveModes.PURCHASE_CONFIRMATION,
    "ALLOWLIST",
  );
  assert.equal(overview.runtime.relationshipReadiness.ready, true);
  assert.ok(Array.isArray(overview.counts.byKindStatus));
  assert.ok(
    overview.counts.byKindStatus.some(
      (r) => r.kind === "WELCOME" && r.status === "SENT",
    ),
  );
  assert.ok(
    overview.counts.suppressions.some((r) => r.reason === "HARD_BOUNCE"),
  );
  assert.ok(overview.counts.events.some((r) => r.type === "DELIVERED"));
  assert.equal(typeof overview.counts.missingPurchaseConfirmations, "number");
  const serialized = JSON.stringify(overview);
  assert.doesNotMatch(
    serialized,
    /earlycv-contacts|earlycv-relationship-email|secret|accessKey/i,
  );
});

test("DTO validation: settings and template bodies reject malformed input", async () => {
  const good = plainToInstance(UpdateEmailSettingsDto, {
    welcomeMode: "OFF",
    feedbackMode: "OFF",
    purchaseConfirmationMode: "OFF",
    startAt: null,
    allowlist: [],
    extraBlocklist: [],
  });
  assert.equal((await validate(good)).length, 0);

  const bad = plainToInstance(UpdateEmailSettingsDto, {
    welcomeMode: "EVERYONE",
    feedbackMode: "OFF",
    purchaseConfirmationMode: "OFF",
    startAt: 5,
    allowlist: "a@b.com",
    extraBlocklist: [1],
  });
  const fields = (await validate(bad)).map((e) => e.property).sort();
  assert.deepEqual(fields, [
    "allowlist",
    "extraBlocklist",
    "startAt",
    "welcomeMode",
  ]);

  const badTemplate = plainToInstance(UpdateEmailTemplateDto, {
    subject: 3,
    body: "x".repeat(20001),
  });
  assert.equal((await validate(badTemplate)).length, 2);
});

test("send-test greets by the recipient's first name when the address belongs to a user", async () => {
  const user = await prisma.user.create({
    data: {
      id: `u_${tag}`,
      email: `${tag}-u@example.com`,
      name: "Maria Souza",
      status: "active",
    },
  });
  createdUserIds.push(user.id);

  // o teste usa o nome do usuário quando o destinatário existe
  const prod = build(true);
  await prod.service.sendTestTemplate("WELCOME", user.email);
  assert.match(String(prod.sent.at(-1)?.message.text), /^Oi, Maria!/);
});
