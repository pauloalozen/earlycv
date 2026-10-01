import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { AdminEmailsModule } from "../admin-emails/admin-emails.module";
import { AdminEmailsService } from "../admin-emails/admin-emails.service";
import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { APP_ENV, EnvModule } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import { EmailSuppressionService } from "../email/email-suppression.service";
import { MonitorModule } from "../monitor/monitor.module";
import { MonitorDigestEmailService } from "../monitor/monitor-digest-email.service";
import { MonitorPublicController } from "../monitor/monitor-public.controller";
import { PlansModule } from "../plans/plans.module";
import { PlansService } from "../plans/plans.service";
import { ProductUpdateEmailService } from "../product-updates/product-update-email.service";
import { ProductUpdateSubscriptionService } from "../product-updates/product-update-subscription.service";
import { ProductUpdatesModule } from "../product-updates/product-updates.module";
import { EmailDispatchConfigService } from "./email-dispatch.config";
import { EmailDispatchModule } from "./email-dispatch.module";
import { EmailDispatchService } from "./email-dispatch.service";
import { buildEnv } from "./email-dispatch.test-support";
import { EmailDispatchWorker } from "./email-dispatch.worker";
import { EmailDispatchWebhookService } from "./email-dispatch-webhook.service";

// Prova que a fiação de DI do módulo resolve (sem banco): o módulo não
// pode derrubar o boot da API por dependência faltando.
test("EmailDispatchModule resolves its whole DI graph and exports what Auth/Monitor need", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [EnvModule, EmailDispatchModule],
  })
    .overrideProvider(APP_ENV)
    .useValue(buildEnv())
    .overrideProvider(DatabaseService)
    .useValue({})
    .compile();

  assert.ok(moduleRef.get(EmailDispatchService, { strict: false }));
  assert.ok(moduleRef.get(EmailDispatchWebhookService, { strict: false }));
  assert.ok(moduleRef.get(EmailDispatchWorker, { strict: false }));

  // Padrão seguro: sem env de modo, tudo OFF e o worker nem acorda.
  const config = moduleRef.get(EmailDispatchConfigService, { strict: false });
  assert.deepEqual(await config.getEnabledKinds(), []);

  await moduleRef.close();
});

// As dependências novas são @Optional nos consumidores existentes — se a
// fiação falhasse, o Nest injetaria undefined em silêncio e os ganchos/
// webhook simplesmente não rodariam. Este teste prova que, no grafo real,
// elas chegam de verdade.
test("AuthService and MonitorPublicController receive the relationship dependencies through real DI", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [EnvModule, AuthModule, MonitorModule],
  })
    .overrideProvider(APP_ENV)
    .useValue(buildEnv())
    .overrideProvider(DatabaseService)
    .useValue({})
    .compile();

  const auth = moduleRef.get(AuthService, { strict: false });
  const controller = moduleRef.get(MonitorPublicController, { strict: false });

  // biome-ignore lint/suspicious/noExplicitAny: inspeção de campo privado no teste
  assert.ok((auth as any).emailDispatch instanceof EmailDispatchService);
  assert.ok(
    // biome-ignore lint/suspicious/noExplicitAny: inspeção de campo privado no teste
    (controller as any).emailDispatchWebhookService instanceof
      EmailDispatchWebhookService,
  );
  assert.ok(
    // biome-ignore lint/suspicious/noExplicitAny: inspeção de campo privado no teste
    (controller as any).suppressionService instanceof EmailSuppressionService,
  );

  await moduleRef.close();
});

// Mesmo raciocínio: todas as dependências novas são @Optional. Se a fiação
// falhasse, a confirmação de compra e a supressão compartilhada ficariam
// desligadas em silêncio — este teste prova que chegam de verdade.
test("PlansService, Monitor digest and Product Updates receive the purchase-confirmation / shared-suppression dependencies through real DI", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [EnvModule, PlansModule, MonitorModule, ProductUpdatesModule],
  })
    .overrideProvider(APP_ENV)
    .useValue(buildEnv())
    .overrideProvider(DatabaseService)
    .useValue({})
    .compile();

  const plans = moduleRef.get(PlansService, { strict: false });
  const digest = moduleRef.get(MonitorDigestEmailService, { strict: false });
  const subscription = moduleRef.get(ProductUpdateSubscriptionService, {
    strict: false,
  });
  const productEmail = moduleRef.get(ProductUpdateEmailService, {
    strict: false,
  });

  // biome-ignore lint/suspicious/noExplicitAny: inspeção de campo privado no teste
  assert.ok((plans as any).emailDispatch instanceof EmailDispatchService);
  // biome-ignore lint/suspicious/noExplicitAny: inspeção de campo privado no teste
  assert.ok((digest as any).suppression instanceof EmailSuppressionService);
  assert.ok(
    // biome-ignore lint/suspicious/noExplicitAny: inspeção de campo privado no teste
    (subscription as any).suppression instanceof EmailSuppressionService,
  );
  assert.ok(
    // biome-ignore lint/suspicious/noExplicitAny: inspeção de campo privado no teste
    (productEmail as any).suppression instanceof EmailSuppressionService,
  );

  await moduleRef.close();
});

// O admin de e-mails junta 5 serviços de 3 módulos: se a fiação quebrar, a aba
// inteira falha no boot. Este teste prova que o grafo resolve.
test("AdminEmailsModule resolves its whole DI graph (dispatch settings/templates/config + purchase recovery)", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [EnvModule, AdminEmailsModule],
  })
    .overrideProvider(APP_ENV)
    .useValue(buildEnv())
    .overrideProvider(DatabaseService)
    .useValue({})
    .compile();

  assert.ok(moduleRef.get(AdminEmailsService, { strict: false }));

  await moduleRef.close();
});
