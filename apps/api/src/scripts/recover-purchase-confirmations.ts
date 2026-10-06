// Auditoria/recuperação de confirmações de compra que não foram enfileiradas
// (ver PurchaseConfirmationRecoveryService). Padrão = DRY-RUN: lista as compras
// concluídas nas últimas N horas SEM linha de confirmação. Só --apply cria as
// linhas (idempotente, respeita modo e cutoff; com o modo OFF não cria nada).
// Não envia e-mail: quem envia é o worker, conforme o modo.
//
//   NODE_OPTIONS='--conditions=development' tsx src/scripts/recover-purchase-confirmations.ts \
//     [--since-hours 24] [--apply]
import "reflect-metadata";

import { parseArgs } from "node:util";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { EnvModule, loadLocalEnvFileIfPresent } from "../config/env.module";
import { DatabaseModule } from "../database/database.module";
import { EmailDispatchModule } from "../email-dispatch/email-dispatch.module";
import { PurchaseConfirmationRecoveryService } from "../plans/purchase-confirmation-recovery.service";

// Sem ScheduleModule: o @Cron de detecção não roda aqui.
@Module({
  imports: [EnvModule, DatabaseModule, EmailDispatchModule],
  providers: [PurchaseConfirmationRecoveryService],
})
class RecoveryScriptModule {}

async function main() {
  const { values } = parseArgs({
    options: {
      "since-hours": { type: "string" },
      apply: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  const sinceHours = values["since-hours"] ? Number(values["since-hours"]) : 24;
  if (!Number.isFinite(sinceHours) || sinceHours <= 0) {
    console.error("--since-hours precisa ser um número > 0");
    process.exit(1);
  }

  loadLocalEnvFileIfPresent();
  const app = await NestFactory.createApplicationContext(RecoveryScriptModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const report = await app
      .get(PurchaseConfirmationRecoveryService)
      .recover({ sinceHours, apply: values.apply === true });

    console.log(
      `[recover-purchase-confirmations] modo=${report.mode} janela=${report.sinceHours}h faltando=${report.missing.length} recuperadas=${report.recovered} ${report.applied ? "(APPLY)" : "(dry-run)"}`,
    );
    // Sem e-mail/PII: só ids opacos.
    for (const item of report.missing) {
      console.log(
        `  purchase=${item.purchaseId} user=${item.userId} plano=${item.planType} concluida=${item.completedAt.toISOString()}`,
      );
    }
    if (!report.applied) {
      console.log(
        report.mode === "OFF"
          ? "[recover-purchase-confirmations] modo OFF: --apply não criaria nada."
          : "[recover-purchase-confirmations] dry-run: use --apply para criar as linhas.",
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("[recover-purchase-confirmations] falhou:", error);
  process.exit(1);
});
