// Script manual de uma vez: força a descoberta + envio de um MonitorDigest
// pra um único usuário (por e-mail), pulando o cron diário. Uso local:
//   NODE_OPTIONS='--conditions=development' tsx src/scripts/trigger-monitor-digest.ts <email>
import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { FakeEmailDeliveryService } from "../email/fake-email-delivery.service";
import { MonitorDigestContentService } from "../monitor/monitor-digest-content.service";
import { MonitorDigestEmailService } from "../monitor/monitor-digest-email.service";
import { MonitorEntitlementService } from "../monitor/monitor-entitlement.service";
import { startOfIsoWeekUtc, startOfUtcDay } from "../monitor/monitor-digest-schedule.util";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("uso: trigger-monitor-digest.ts <email>");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const database = new DatabaseService(prisma);

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`nenhum usuário com email ${email}`);
      process.exit(1);
    }

    const preference = await prisma.monitorAlertPreference.findUnique({
      where: { userId: user.id },
    });
    const frequency = preference?.frequency === "WEEKLY" ? "WEEKLY" : "DAILY";
    const now = new Date();
    const scheduledFor =
      frequency === "WEEKLY" ? startOfIsoWeekUtc(now) : startOfUtcDay(now);

    console.log(
      `[trigger-monitor-digest] user=${user.id} frequency=${frequency} scheduledFor=${scheduledFor.toISOString()}`,
    );

    const existing = await prisma.monitorDigest.findUnique({
      where: {
        userId_frequency_scheduledFor: {
          userId: user.id,
          frequency,
          scheduledFor,
        },
      },
    });
    if (existing) {
      console.log(
        `[trigger-monitor-digest] já existe um digest ${existing.status} pra esse período (id=${existing.id}) — apagando pra recriar (script de teste local, não roda em prod)`,
      );
      await prisma.monitorDigest.delete({ where: { id: existing.id } });
    }

    const contentService = new MonitorDigestContentService(database);
    const eligible = await contentService.getEligibleRecommendations(user.id);
    console.log(
      `[trigger-monitor-digest] ${eligible.length} recomendações elegíveis`,
    );

    if (eligible.length === 0) {
      console.log("[trigger-monitor-digest] nada elegível — nada a enviar");
      return;
    }

    const digest = await prisma.monitorDigest.create({
      data: {
        userId: user.id,
        frequency,
        scheduledFor,
        status: "PENDING",
        recommendations: {
          create: eligible.map((r) => ({ recommendationId: r.id })),
        },
      },
    });
    console.log(`[trigger-monitor-digest] digest criado id=${digest.id}`);

    const emailService = new MonitorDigestEmailService(
      database,
      new FakeEmailDeliveryService(),
      new MonitorEntitlementService(database),
    );
    const result = await emailService.sendDigest(digest.id);
    console.log("[trigger-monitor-digest] resultado do envio:", result);

    if (result.sent) {
      await prisma.monitorDigest.update({
        where: { id: digest.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
        },
      });
      console.log("[trigger-monitor-digest] digest marcado como SENT");
    } else {
      await prisma.monitorDigest.update({
        where: { id: digest.id },
        data: { status: "SKIPPED", lastError: result.skippedReason },
      });
      console.log(
        `[trigger-monitor-digest] envio pulado: ${result.skippedReason}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
