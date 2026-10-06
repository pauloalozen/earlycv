// Teste EXPLÍCITO e controlado dos e-mails (boas-vindas / feedback /
// confirmação de compra). Destinatário INFORMADO (exatamente um), um envio
// por execução, NUNCA varre a base. Pode usar as contas bloqueadas da
// automação (paulo.alozen@gmail.com, contato@earlycv.com.br): é o único
// caminho que as aceita.
//
// Níveis, do mais seguro ao mais perigoso:
//   (padrão)     DRY-RUN: renderiza e imprime. Não abre banco nem rede.
//   --fake-send  Fluxo completo (grava EmailDispatch isTest) com transporte
//                FAKE: nada sai pela rede. Usa o banco.
//   --real-send  Envio REAL (SES/Resend). Opção explícita, um único --to,
//                exige a infra completa. Grava EmailDispatch isTest.
//     + --no-db  (welcome/feedback/feedback2) envia sem abrir o banco nem gravar nada;
//                os eventos voltam pelo webhook de produção.
//
// Uso:
//   NODE_OPTIONS='--conditions=development' tsx src/scripts/send-relationship-test.ts \
//     --kind welcome|feedback|feedback2|purchase --to <email> [--name "Nome"] \
//     [--plan pro --amount 4990 --credits 5 --analysis 5 --coupon --unlimited] \
//     [--fake-send | --real-send [--no-db]]
import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import {
  EnvModule,
  loadAppEnv,
  loadLocalEnvFileIfPresent,
} from "../config/env.module";
import { DefaultEmailService } from "../email/email.service";
import { EmailConfigService } from "../email/email-config.service";
import { EmailDeliveryProviderAdapter } from "../email/email-delivery-provider.adapter";
import { DefaultEmailRoutingPolicy } from "../email/email-routing.policy";
import { FakeEmailDeliveryService } from "../email/fake-email-delivery.service";
import { SesEmailProviderService } from "../email/ses-email-provider.service";
import { EmailDispatchConfigService } from "../email-dispatch/email-dispatch.config";
import { EmailDispatchModule } from "../email-dispatch/email-dispatch.module";
import {
  EmailDispatchService,
  renderDispatchEmail,
} from "../email-dispatch/email-dispatch.service";
import { OFF_SNAPSHOT } from "../email-dispatch/email-dispatch-settings.service";
import { sendRelationshipTestWithoutDb } from "../email-dispatch/email-dispatch-standalone";
import {
  parseTestArgs,
  TestArgsError,
} from "../email-dispatch/email-dispatch-test-args";

// Contexto mínimo (EnvModule + EmailDispatchModule), SEM ScheduleModule:
// nenhum worker/cron sobe — só o serviço é chamado, uma vez.
@Module({ imports: [EnvModule, EmailDispatchModule] })
class RelationshipTestModule {}

async function main() {
  let args: ReturnType<typeof parseTestArgs>;
  try {
    args = parseTestArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof TestArgsError) {
      console.error(`[relationship-test] ${error.message}`);
      console.error(
        "uso: send-relationship-test.ts --kind welcome|feedback|feedback2|purchase --to <um e-mail> [--name X] [--plan --amount --credits --analysis --coupon --unlimited] [--fake-send | --real-send [--no-db]]",
      );
      process.exit(1);
    }
    throw error;
  }

  const rendered = renderDispatchEmail({
    kind: args.kind,
    name: args.name,
    payload: args.payload,
  });

  const label = {
    "dry-run": "DRY-RUN",
    fake: "FAKE-SEND (transporte fake)",
    real: args.noDb ? "REAL-SEND sem banco (rede)" : "REAL-SEND (rede)",
  }[args.transport];
  console.log(
    `[relationship-test] kind=${args.kind} to=${args.to} mode=${label}`,
  );
  console.log(`\nAssunto: ${rendered.subject}\n\n${rendered.text}\n`);

  if (args.transport === "dry-run") {
    console.log(
      "[relationship-test] dry-run: nada foi enviado nem gravado. Use --fake-send (sem rede) ou --real-send (envio real).",
    );
    return;
  }

  loadLocalEnvFileIfPresent();

  if (args.noDb) {
    // Sem Nest e sem banco: só a configuração do SES + a fachada de e-mail.
    const env = await loadAppEnv();
    const emailConfig = new EmailConfigService(env);
    // Só a prontidão do SES é consultada aqui; modos/cutoff (banco) não importam
    // para um teste explícito.
    const config = new EmailDispatchConfigService(env, emailConfig, {
      getSnapshot: async () => OFF_SNAPSHOT,
    });
    const emailService = new DefaultEmailService(
      new DefaultEmailRoutingPolicy(
        new EmailDeliveryProviderAdapter(new FakeEmailDeliveryService()),
        new SesEmailProviderService(emailConfig),
        emailConfig,
      ),
    );
    const result = await sendRelationshipTestWithoutDb({
      kind: args.kind as
        | "WELCOME"
        | "FEEDBACK_FIRST_USE"
        | "FEEDBACK_SECOND_CALL",
      to: args.to,
      name: args.name,
      appUrl:
        process.env.FRONTEND_URL ??
        process.env.APP_URL ??
        "https://earlycv.com.br",
      config,
      emailService,
    });
    console.log(
      "[relationship-test] resultado:",
      JSON.stringify(result, null, 2),
    );
    if (!result.sent || result.result.outcome !== "SENT") process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(
    RelationshipTestModule,
    {
      logger: ["error", "warn", "log"],
    },
  );
  try {
    const service = app.get(EmailDispatchService);
    const result = await service.sendTest({
      kind: args.kind,
      to: args.to,
      name: args.name,
      payload: args.payload,
      realTransport: args.transport === "real",
    });
    console.log(
      "[relationship-test] resultado:",
      JSON.stringify(result, null, 2),
    );
    if (!result.sent) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[relationship-test] falhou:", error);
  process.exit(1);
});
