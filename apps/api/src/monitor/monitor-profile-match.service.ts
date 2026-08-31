import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { computeMonitorMatchFingerprint } from "./monitor-profile-fingerprint";

// Ponto único de gatilho do backfill/rematch do Monitor — os dois cenários
// da Fase 1.5 (usuário entrando pela primeira vez / perfil editado) só
// diferem em QUANDO chamam este service; o resto (fila, worker, prefiltro,
// reconciliação) é o mesmo mecanismo, ver MonitorProfileMatchingWorker.
@Injectable()
export class MonitorProfileMatchService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  // Chamado no caminho de leitura (GET /monitor, GET /monitor/count) — tem
  // que ser barato: um SELECT pelo profile (já em cache de request em
  // muitos casos) e, na maioria das chamadas (perfil já processado ao menos
  // uma vez), nenhuma escrita. Checagem de entitlement aqui é defesa em
  // profundidade — MonitorEntitlementGuard já barra a requisição HTTP antes
  // de chegar aqui, mas este service não deveria confiar só nisso caso
  // ganhe outro caller no futuro (ex.: um job em background).
  async ensureMonitorInitialized(userId: string): Promise<void> {
    const { allowed } = await this.entitlementService.canUseMonitor(userId);
    if (!allowed) {
      return;
    }

    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId },
    });

    // Sem UserRadarProfile ou sem áreas: mesmo estado de "sem CV master"
    // tratado em UserRadarProfileService.getProfile — não há o que
    // monitorar ainda, não enfileira nada.
    if (!profile || profile.areas.length === 0) {
      return;
    }

    if (profile.lastMatchedAt !== null) {
      // Já completou pelo menos um matching com sucesso — nada a
      // inicializar. O caminho de mudança de perfil é enqueueRematch, não
      // este método.
      return;
    }

    const matchJob = await this.database.monitorProfileMatchJob.findUnique({
      where: { userId },
    });

    // PENDING/PROCESSING: já enfileirado, nada a fazer. FAILED (esgotou
    // attempts) ou nunca criado: dá mais uma chance — é o "seguro" de
    // recuperação citado na spec (o worker reiniciando/attempts esgotados
    // não pode deixar o usuário preso pra sempre em INITIALIZING).
    if (matchJob && matchJob.status !== "FAILED") {
      return;
    }

    await this.database.monitorProfileMatchJob.upsert({
      where: { userId },
      create: { userId },
      update: { status: "PENDING", attempts: 0, lastError: null },
    });
  }

  // Chamado depois de um PUT /monitor/profile bem-sucedido. A decisão de
  // "isso é relevante o bastante pra reprocessar" NÃO é uma lista de campos
  // no controller — é o fingerprint: ele já só reflete os campos que
  // MatchingEngine.calculateScore consome, então uma edição que só mexe em
  // preferredContractTypes/openToRelocation/certifications (não usados por
  // calculateScore hoje) naturalmente não muda o fingerprint e não
  // reprocessa nada.
  async enqueueRematch(userId: string): Promise<void> {
    const { allowed } = await this.entitlementService.canUseMonitor(userId);
    if (!allowed) {
      return;
    }

    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId },
    });

    if (!profile || profile.areas.length === 0) {
      return;
    }

    const currentFingerprint = computeMonitorMatchFingerprint(profile);

    if (
      profile.lastMatchedAt !== null &&
      profile.matchFingerprint === currentFingerprint
    ) {
      // Edição não mudou nada relevante ao matching (ou reverteu pra um
      // estado já processado) — idempotente, sem custo de reprocessamento.
      return;
    }

    await this.database.userRadarProfile.update({
      where: { userId },
      data: {
        // Só rebaixa pra REFRESHING quem já tinha completado ao menos um
        // matching — quem ainda está em INITIALIZING continua
        // INITIALIZING (mais preciso pro frontend: ainda não existe feed
        // nenhum pra "atualizar").
        monitorStatus:
          profile.lastMatchedAt !== null ? "REFRESHING" : "INITIALIZING",
      },
    });

    // Upsert por userId único: se já existe um job PENDING/PROCESSING
    // (ex.: duas edições rápidas), esta chamada não cria um segundo — o
    // worker sempre lê o UserRadarProfile mais recente no momento em que
    // processa, então a edição mais nova "vence" naturalmente sem precisar
    // de uma segunda linha na fila.
    await this.database.monitorProfileMatchJob.upsert({
      where: { userId },
      create: { userId },
      update: { status: "PENDING", attempts: 0, lastError: null },
    });
  }

  // Variante usada pelo painel admin de diagnóstico do Monitor: reenfileira
  // incondicionalmente, ignorando o fingerprint — enqueueRematch acima é
  // idempotente de propósito (edição sem mudança relevante não reprocessa),
  // mas um admin investigando um resultado suspeito às vezes precisa forçar
  // o reprocessamento mesmo sem edição de perfil. Nunca chamado pelo fluxo
  // normal de usuário.
  async forceRematch(
    userId: string,
  ): Promise<{ enqueued: boolean; reason?: string }> {
    const { allowed } = await this.entitlementService.canUseMonitor(userId);
    if (!allowed) {
      return { enqueued: false, reason: "not_entitled" };
    }

    const profile = await this.database.userRadarProfile.findUnique({
      where: { userId },
    });
    if (!profile || profile.areas.length === 0) {
      return { enqueued: false, reason: "no_profile" };
    }

    await this.database.userRadarProfile.update({
      where: { userId },
      data: {
        monitorStatus:
          profile.lastMatchedAt !== null ? "REFRESHING" : "INITIALIZING",
      },
    });

    await this.database.monitorProfileMatchJob.upsert({
      where: { userId },
      create: { userId },
      update: { status: "PENDING", attempts: 0, lastError: null },
    });

    return { enqueued: true };
  }
}
