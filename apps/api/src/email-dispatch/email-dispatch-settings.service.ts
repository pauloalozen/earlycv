import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type EmailDispatchModeValue = "OFF" | "SHADOW" | "ALLOWLIST" | "LIVE";

export const EMAIL_DISPATCH_MODES: EmailDispatchModeValue[] = [
  "OFF",
  "SHADOW",
  "ALLOWLIST",
  "LIVE",
];

// O que o dispatch lê para decidir se roda. Falha fechada: sem linha, ou com
// erro de leitura, é TUDO OFF e sem cutoff.
export type SettingsSnapshot = {
  welcomeMode: EmailDispatchModeValue;
  feedbackMode: EmailDispatchModeValue;
  feedbackSecondCallMode: EmailDispatchModeValue;
  purchaseConfirmationMode: EmailDispatchModeValue;
  startAt: Date | null;
  allowlist: string[];
  extraBlocklist: string[];
};

export const OFF_SNAPSHOT: SettingsSnapshot = {
  welcomeMode: "OFF",
  feedbackMode: "OFF",
  feedbackSecondCallMode: "OFF",
  purchaseConfirmationMode: "OFF",
  startAt: null,
  allowlist: [],
  extraBlocklist: [],
};

export type AdminSettings = SettingsSnapshot & {
  updatedAt: Date | null;
  updatedByAdminId: string | null;
};

export type UpdateSettingsInput = {
  welcomeMode: EmailDispatchModeValue;
  feedbackMode: EmailDispatchModeValue;
  // Opcional por compatibilidade com clientes antigos: ausente = mantém o atual.
  feedbackSecondCallMode?: EmailDispatchModeValue;
  purchaseConfirmationMode: EmailDispatchModeValue;
  startAt: string | null;
  allowlist: string[];
  extraBlocklist: string[];
  // Obrigatório ao colocar qualquer tipo em LIVE (envio real para a base).
  confirmLive?: boolean;
};

const CACHE_TTL_MS = 10_000;
const ERROR_CACHE_TTL_MS = 5_000;
const MAX_LIST = 200;
const EMAIL_PATTERN = /^[^\s,;<>()"@]+@[^\s,;<>()"@]+\.[^\s,;<>()"@]+$/;

export function normalizeEmailList(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  ];
}

function fromRow(row: {
  welcomeMode: EmailDispatchModeValue;
  feedbackMode: EmailDispatchModeValue;
  feedbackSecondCallMode: EmailDispatchModeValue;
  purchaseConfirmationMode: EmailDispatchModeValue;
  startAt: Date | null;
  allowlist: string[];
  extraBlocklist: string[];
}): SettingsSnapshot {
  return {
    welcomeMode: row.welcomeMode,
    feedbackMode: row.feedbackMode,
    feedbackSecondCallMode: row.feedbackSecondCallMode,
    purchaseConfirmationMode: row.purchaseConfirmationMode,
    startAt: row.startAt,
    allowlist: row.allowlist,
    extraBlocklist: row.extraBlocklist,
  };
}

// Configuração do dispatch gerenciada pelo admin (aba Emails → Configurações),
// no padrão de MonitorDigestScheduleConfig — NÃO por variável de ambiente.
// Leitura com cache curto (10s) para o worker/enqueue não baterem no banco a
// cada chamada; uma alteração vale em todas as instâncias em até ~10s e
// imediatamente na que gravou. FALHA FECHADA: sem linha ou erro de leitura =
// tudo OFF (nunca "último valor conhecido").
@Injectable()
export class EmailDispatchSettingsService {
  private readonly logger = new Logger(EmailDispatchSettingsService.name);
  private cached: { value: SettingsSnapshot; expiresAt: number } | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  invalidate() {
    this.cached = null;
  }

  async getSnapshot(now: number = Date.now()): Promise<SettingsSnapshot> {
    if (this.cached && this.cached.expiresAt > now) {
      return this.cached.value;
    }

    try {
      const row = await this.database.emailDispatchSettings.findUnique({
        where: { id: "default" },
      });
      const value = row ? fromRow(row) : OFF_SNAPSHOT;
      this.cached = { value, expiresAt: now + CACHE_TTL_MS };
      return value;
    } catch (error) {
      this.logger.error(
        `email_dispatch_settings_unreadable action=fail_closed_all_off reason=${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      this.cached = {
        value: OFF_SNAPSHOT,
        expiresAt: now + ERROR_CACHE_TTL_MS,
      };
      return OFF_SNAPSHOT;
    }
  }

  // Para a tela de admin: sempre direto do banco (sem cache).
  async getForAdmin(): Promise<AdminSettings> {
    const row = await this.database.emailDispatchSettings.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return { ...OFF_SNAPSHOT, updatedAt: null, updatedByAdminId: null };
    }
    return {
      ...fromRow(row),
      updatedAt: row.updatedAt,
      updatedByAdminId: row.updatedByAdminId,
    };
  }

  // Regras (todas no backend; a UI só repete para dar feedback):
  //  - modo diferente de OFF exige cutoff (startAt) — sem ele nada roda mesmo;
  //  - ALLOWLIST exige allowlist não vazia;
  //  - LIVE (novo) exige confirmação explícita;
  //  - e-mails válidos, normalizados, sem duplicados, no máximo 200.
  validate(
    input: UpdateSettingsInput,
    previous: SettingsSnapshot,
  ): {
    startAt: Date | null;
    allowlist: string[];
    extraBlocklist: string[];
  } {
    const errors: string[] = [];
    const modes = [
      ["boas-vindas", input.welcomeMode, previous.welcomeMode],
      ["feedback", input.feedbackMode, previous.feedbackMode],
      [
        "feedback segunda chamada",
        input.feedbackSecondCallMode ?? previous.feedbackSecondCallMode,
        previous.feedbackSecondCallMode,
      ],
      [
        "confirmação de compra",
        input.purchaseConfirmationMode,
        previous.purchaseConfirmationMode,
      ],
    ] as const;

    for (const [label, mode] of modes) {
      if (!EMAIL_DISPATCH_MODES.includes(mode)) {
        errors.push(`Modo inválido para ${label}.`);
      }
    }

    let startAt: Date | null = null;
    if (input.startAt) {
      const parsed = new Date(input.startAt);
      if (Number.isNaN(parsed.getTime())) {
        errors.push("O cutoff (início) não é uma data válida.");
      } else {
        startAt = parsed;
      }
    }

    const allowlist = normalizeEmailList(input.allowlist);
    const extraBlocklist = normalizeEmailList(input.extraBlocklist);
    for (const [label, list] of [
      ["allowlist", allowlist],
      ["bloqueio extra", extraBlocklist],
    ] as const) {
      if (list.length > MAX_LIST) {
        errors.push(`A lista de ${label} passa de ${MAX_LIST} endereços.`);
      }
      const invalid = list.filter((email) => !EMAIL_PATTERN.test(email));
      if (invalid.length > 0) {
        errors.push(
          `Endereço inválido na lista de ${label}: ${invalid.slice(0, 3).join(", ")}.`,
        );
      }
    }

    const anyOn = modes.some(([, mode]) => mode !== "OFF");
    if (anyOn && !startAt) {
      errors.push(
        "Defina o cutoff (início) antes de ligar qualquer tipo: sem ele nada roda e a base antiga nunca recebe.",
      );
    }
    if (
      modes.some(([, mode]) => mode === "ALLOWLIST") &&
      allowlist.length === 0
    ) {
      errors.push("O modo ALLOWLIST exige ao menos um e-mail na allowlist.");
    }
    const newLive = modes.filter(
      ([, mode, before]) => mode === "LIVE" && before !== "LIVE",
    );
    if (newLive.length > 0 && input.confirmLive !== true) {
      errors.push(
        `Confirmação obrigatória para colocar em LIVE (envio real): ${newLive.map(([label]) => label).join(", ")}.`,
      );
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(" "));
    }
    return { startAt, allowlist, extraBlocklist };
  }

  async update(
    adminId: string,
    input: UpdateSettingsInput,
  ): Promise<AdminSettings> {
    const before = await this.getForAdmin();
    const { startAt, allowlist, extraBlocklist } = this.validate(input, before);

    const data = {
      welcomeMode: input.welcomeMode,
      feedbackMode: input.feedbackMode,
      feedbackSecondCallMode:
        input.feedbackSecondCallMode ?? before.feedbackSecondCallMode,
      purchaseConfirmationMode: input.purchaseConfirmationMode,
      startAt,
      allowlist,
      extraBlocklist,
      updatedByAdminId: adminId,
    };
    const row = await this.database.emailDispatchSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });
    this.invalidate();

    // Auditoria no mesmo log das demais ações administrativas de e-mail.
    // Sem endereços (só contagens) — modos e cutoff são o que importa.
    await this.database.monitorAdminActionLog.create({
      data: {
        adminId,
        action: "email_dispatch_settings_updated",
        entityType: "EmailDispatchSettings",
        entityId: "default",
        result: "ok",
        metadataJson: {
          before: {
            welcomeMode: before.welcomeMode,
            feedbackMode: before.feedbackMode,
            feedbackSecondCallMode: before.feedbackSecondCallMode,
            purchaseConfirmationMode: before.purchaseConfirmationMode,
            startAt: before.startAt?.toISOString() ?? null,
          },
          after: {
            welcomeMode: row.welcomeMode,
            feedbackMode: row.feedbackMode,
            feedbackSecondCallMode: row.feedbackSecondCallMode,
            purchaseConfirmationMode: row.purchaseConfirmationMode,
            startAt: row.startAt?.toISOString() ?? null,
            allowlistCount: row.allowlist.length,
            extraBlocklistCount: row.extraBlocklist.length,
          },
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `email_dispatch_settings_updated adminId=${adminId} welcome=${row.welcomeMode} feedback=${row.feedbackMode} feedback2=${row.feedbackSecondCallMode} purchase=${row.purchaseConfirmationMode} startAt=${row.startAt?.toISOString() ?? "unset"}`,
    );

    return {
      ...fromRow(row),
      updatedAt: row.updatedAt,
      updatedByAdminId: row.updatedByAdminId,
    };
  }
}
