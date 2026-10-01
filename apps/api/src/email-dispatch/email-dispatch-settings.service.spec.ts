import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";

import { EmailDispatchConfigService } from "./email-dispatch.config";
import { createTable, type Row } from "./email-dispatch.test-support";
import {
  EmailDispatchSettingsService,
  OFF_SNAPSHOT,
  type UpdateSettingsInput,
} from "./email-dispatch-settings.service";

function setup(options: { failReads?: boolean } = {}) {
  const emailDispatchSettings = createTable({ uniqueKeys: ["id"] });
  const monitorAdminActionLog = createTable();
  let reads = 0;
  const original = emailDispatchSettings.findUnique;
  emailDispatchSettings.findUnique = async (args: { where: Row }) => {
    reads += 1;
    if (options.failReads) throw new Error("db down");
    return original(args);
  };
  const database = { emailDispatchSettings, monitorAdminActionLog } as never;
  const service = new EmailDispatchSettingsService(database);
  return {
    service,
    emailDispatchSettings,
    monitorAdminActionLog,
    reads: () => reads,
  };
}

const valid = (
  overrides: Partial<UpdateSettingsInput> = {},
): UpdateSettingsInput => ({
  welcomeMode: "OFF",
  feedbackMode: "OFF",
  purchaseConfirmationMode: "OFF",
  startAt: null,
  allowlist: [],
  extraBlocklist: [],
  ...overrides,
});

const messageOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof BadRequestException);
    return error.message;
  }
  assert.fail("esperava BadRequestException");
};

test("no row = ALL OFF and no cutoff (fail closed)", async () => {
  const { service } = setup();
  assert.deepEqual(await service.getSnapshot(), OFF_SNAPSHOT);
  const admin = await service.getForAdmin();
  assert.equal(admin.updatedAt, null);
  assert.equal(admin.welcomeMode, "OFF");
});

test("a read ERROR is fail-closed (all OFF, never the last known value), logged, and retried soon", async () => {
  const { service, emailDispatchSettings } = setup();
  await emailDispatchSettings.create({
    data: {
      id: "default",
      welcomeMode: "LIVE",
      feedbackMode: "OFF",
      purchaseConfirmationMode: "OFF",
      startAt: new Date(),
      allowlist: [],
      extraBlocklist: [],
    },
  });
  assert.equal((await service.getSnapshot(0)).welcomeMode, "LIVE");

  const failing = setup({ failReads: true });
  const lines: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: logger privado no teste
  (failing.service as any).logger = {
    error: (m: string) => lines.push(m),
    log: () => {},
  };

  const snapshot = await failing.service.getSnapshot(0);

  assert.deepEqual(snapshot, OFF_SNAPSHOT);
  assert.match(
    lines[0],
    /^email_dispatch_settings_unreadable action=fail_closed_all_off reason=db down$/,
  );
  // cache curto de erro (5s): a próxima leitura dentro dele não bate no banco...
  await failing.service.getSnapshot(1_000);
  assert.equal(failing.reads(), 1);
  // ...e depois dele tenta de novo.
  await failing.service.getSnapshot(6_000);
  assert.equal(failing.reads(), 2);
});

test("reads are cached for 10s and an update invalidates the cache immediately", async () => {
  const { service, reads } = setup();

  await service.getSnapshot(0);
  await service.getSnapshot(9_000);
  assert.equal(reads(), 1);
  await service.getSnapshot(10_001);
  assert.equal(reads(), 2);

  await service.update("admin_1", valid());
  const before = reads();
  await service.getSnapshot(10_002);
  assert.ok(reads() > before, "update invalida o cache");
});

test("turning any type on requires a cutoff; ALLOWLIST requires a non-empty allowlist", async () => {
  const { service } = setup();

  assert.match(
    await messageOf(service.update("a", valid({ welcomeMode: "SHADOW" }))),
    /Defina o cutoff/,
  );
  assert.match(
    await messageOf(
      service.update(
        "a",
        valid({
          welcomeMode: "ALLOWLIST",
          startAt: "2026-10-15T00:00:00.000Z",
        }),
      ),
    ),
    /exige ao menos um e-mail na allowlist/,
  );
});

test("LIVE needs explicit confirmation, but only when it is newly entering LIVE", async () => {
  const { service } = setup();
  const live = valid({
    welcomeMode: "LIVE",
    startAt: "2026-10-15T00:00:00.000Z",
  });

  assert.match(
    await messageOf(service.update("a", live)),
    /Confirmação obrigatória.*boas-vindas/,
  );

  await service.update("a", { ...live, confirmLive: true });
  // já estava LIVE: salvar outra coisa não exige confirmar de novo
  const again = await service.update("a", { ...live, feedbackMode: "SHADOW" });
  assert.equal(again.welcomeMode, "LIVE");
  assert.equal(again.feedbackMode, "SHADOW");
});

test("emails are validated, lower-cased and de-duplicated; invalid dates are rejected", async () => {
  const { service } = setup();

  const saved = await service.update(
    "a",
    valid({
      welcomeMode: "ALLOWLIST",
      startAt: "2026-10-15T00:00:00.000Z",
      allowlist: [
        " Maria@Example.com ",
        "maria@example.com",
        "joao@example.com",
      ],
      extraBlocklist: ["BLOCK@x.com"],
    }),
  );
  assert.deepEqual(saved.allowlist, ["maria@example.com", "joao@example.com"]);
  assert.deepEqual(saved.extraBlocklist, ["block@x.com"]);

  assert.match(
    await messageOf(
      service.update("a", valid({ allowlist: ["not-an-email"] })),
    ),
    /Endereço inválido na lista de allowlist: not-an-email/,
  );
  assert.match(
    await messageOf(service.update("a", valid({ startAt: "ontem" }))),
    /cutoff.*não é uma data válida/,
  );
  assert.match(
    await messageOf(
      service.update(
        "a",
        valid({
          allowlist: Array.from({ length: 201 }, (_, i) => `u${i}@x.com`),
        }),
      ),
    ),
    /passa de 200/,
  );
});

test("a failed validation never writes anything", async () => {
  const { service, emailDispatchSettings, monitorAdminActionLog } = setup();

  await assert.rejects(() =>
    service.update("a", valid({ feedbackMode: "LIVE" })),
  );

  assert.equal(emailDispatchSettings.rows.length, 0);
  assert.equal(monitorAdminActionLog.rows.length, 0);
});

test("every update is audited with before/after modes and COUNTS only — never the e-mail addresses", async () => {
  const { service, monitorAdminActionLog } = setup();

  await service.update(
    "admin_9",
    valid({
      welcomeMode: "ALLOWLIST",
      startAt: "2026-10-15T00:00:00.000Z",
      allowlist: ["secret.person@example.com"],
    }),
  );

  const log = monitorAdminActionLog.rows[0];
  assert.equal(log.adminId, "admin_9");
  assert.equal(log.action, "email_dispatch_settings_updated");
  assert.equal(log.entityType, "EmailDispatchSettings");
  assert.equal(log.metadataJson.before.welcomeMode, "OFF");
  assert.equal(log.metadataJson.after.welcomeMode, "ALLOWLIST");
  assert.equal(log.metadataJson.after.allowlistCount, 1);
  assert.doesNotMatch(JSON.stringify(log.metadataJson), /secret\.person/);
});

test("the dispatch config reads the saved settings: modes, cutoff, allowlist and extra blocklist drive the decisions (admin-managed, no env)", async () => {
  const { service } = setup();
  await service.update(
    "a",
    valid({
      welcomeMode: "LIVE",
      feedbackMode: "ALLOWLIST",
      purchaseConfirmationMode: "SHADOW",
      startAt: "2026-10-15T00:00:00.000Z",
      allowlist: ["tester@example.com"],
      extraBlocklist: ["blocked@example.com"],
      confirmLive: true,
    }),
  );
  const production = new (class extends EmailDispatchConfigService {
    protected override isProduction() {
      return true;
    }
  })(
    {},
    {
      isSesEnabled: () => true,
      getSesClientConfig: () => ({}) as never,
      getSesSenderProfile: () => ({}) as never,
    },
    service,
  );
  const staging = new EmailDispatchConfigService(
    {},
    {
      isSesEnabled: () => true,
      getSesClientConfig: () => ({}) as never,
      getSesSenderProfile: () => ({}) as never,
    },
    service,
  );

  assert.equal(await production.getEffectiveMode("WELCOME"), "LIVE");
  assert.equal(
    await production.getEffectiveMode("FEEDBACK_FIRST_USE"),
    "ALLOWLIST",
  );
  assert.equal(
    await production.getEffectiveMode("PURCHASE_CONFIRMATION"),
    "SHADOW",
  );
  assert.equal(
    (await production.getStartAt())?.toISOString(),
    "2026-10-15T00:00:00.000Z",
  );
  assert.equal(await production.isAllowlisted("TESTER@example.com"), true);
  assert.equal(await production.isAllowlisted("maria@example.com"), false);
  assert.equal(await production.isBlocked("blocked@example.com"), true);
  assert.equal(await production.isBlocked("paulo.alozen@gmail.com"), true); // fixa no código
  // fora de produção: LIVE vira ALLOWLIST
  assert.equal(await staging.getEffectiveMode("WELCOME"), "ALLOWLIST");
});
