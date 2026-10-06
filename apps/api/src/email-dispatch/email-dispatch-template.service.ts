import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  EMAIL_TEMPLATE_KEYS,
  type EmailTemplateKeyValue,
  type RenderedEmail,
  renderSample,
  TEMPLATE_DEFINITIONS,
  type TemplateContent,
  validateTemplate,
} from "./email-dispatch-templates";

const CACHE_TTL_MS = 10_000;

export type EffectiveTemplate = TemplateContent & {
  key: EmailTemplateKeyValue;
  isCustom: boolean;
  version: number;
  updatedAt: Date | null;
  updatedByAdminId: string | null;
};

function appUrl(): string {
  return (
    process.env.FRONTEND_URL ?? process.env.APP_URL ?? "https://earlycv.com.br"
  );
}

// Assunto/corpo editáveis dos e-mails do dispatch (aba Emails → Templates),
// no padrão do conteúdo editável do Alerta (MonitorDigestEmailContent) e do
// Product Updates. Sem linha salva vale o texto padrão do código. As regras
// de conteúdo (validateTemplate) valem no salvar E no preview. Leitura com
// cache curto; erro de leitura cai no texto padrão (nunca impede um envio).
@Injectable()
export class EmailDispatchTemplateService {
  private readonly logger = new Logger(EmailDispatchTemplateService.name);
  private cached: {
    value: Map<EmailTemplateKeyValue, EffectiveTemplate>;
    expiresAt: number;
  } | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  invalidate() {
    this.cached = null;
  }

  private defaultsFor(key: EmailTemplateKeyValue): EffectiveTemplate {
    return {
      key,
      ...TEMPLATE_DEFINITIONS[key].defaults,
      isCustom: false,
      version: 0,
      updatedAt: null,
      updatedByAdminId: null,
    };
  }

  private async load(
    now: number = Date.now(),
  ): Promise<Map<EmailTemplateKeyValue, EffectiveTemplate>> {
    if (this.cached && this.cached.expiresAt > now) return this.cached.value;

    const map = new Map<EmailTemplateKeyValue, EffectiveTemplate>(
      EMAIL_TEMPLATE_KEYS.map((key) => [key, this.defaultsFor(key)]),
    );
    try {
      const rows = await this.database.emailDispatchTemplate.findMany();
      for (const row of rows) {
        map.set(row.key, {
          key: row.key,
          subject: row.subject,
          body: row.body,
          isCustom: true,
          version: row.version,
          updatedAt: row.updatedAt,
          updatedByAdminId: row.updatedByAdminId,
        });
      }
    } catch (error) {
      this.logger.error(
        `email_dispatch_templates_unreadable action=use_defaults reason=${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
    this.cached = { value: map, expiresAt: now + CACHE_TTL_MS };
    return map;
  }

  async getEffective(key: EmailTemplateKeyValue): Promise<EffectiveTemplate> {
    const all = await this.load();
    return all.get(key) ?? this.defaultsFor(key);
  }

  async listForAdmin() {
    const all = await this.load(0);
    return EMAIL_TEMPLATE_KEYS.map((key) => ({
      key,
      label: TEMPLATE_DEFINITIONS[key].label,
      description: TEMPLATE_DEFINITIONS[key].description,
      variables: TEMPLATE_DEFINITIONS[key].variables,
      unsubscribeFooter: TEMPLATE_DEFINITIONS[key].unsubscribeFooter,
      defaults: TEMPLATE_DEFINITIONS[key].defaults,
      current: all.get(key) ?? this.defaultsFor(key),
    }));
  }

  // Valida e renderiza com dados de EXEMPLO, sem gravar — o editor mostra
  // erros e preview antes de salvar.
  preview(
    key: EmailTemplateKeyValue,
    content: TemplateContent,
  ): { errors: string[]; rendered: RenderedEmail | null } {
    const errors = validateTemplate(key, content);
    return {
      errors,
      rendered:
        errors.length === 0 ? renderSample(key, content, appUrl()) : null,
    };
  }

  async update(
    adminId: string,
    key: EmailTemplateKeyValue,
    content: TemplateContent,
  ) {
    const errors = validateTemplate(key, content);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join(" "));
    }

    const existing = await this.database.emailDispatchTemplate.findUnique({
      where: { key },
    });
    const data = {
      subject: content.subject.trim(),
      body: content.body.trim(),
      updatedByAdminId: adminId,
    };
    const row = existing
      ? await this.database.emailDispatchTemplate.update({
          where: { key },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.database.emailDispatchTemplate.create({
          data: { key, ...data },
        });
    this.invalidate();

    await this.logAction(adminId, "email_dispatch_template_updated", key, {
      version: row.version,
      subjectLength: row.subject.length,
      bodyLength: row.body.length,
    });
    return row;
  }

  // Volta ao texto padrão do código (apaga a edição).
  async reset(adminId: string, key: EmailTemplateKeyValue) {
    await this.database.emailDispatchTemplate.deleteMany({ where: { key } });
    this.invalidate();
    await this.logAction(adminId, "email_dispatch_template_reset", key, {});
    return this.defaultsFor(key);
  }

  private async logAction(
    adminId: string,
    action: string,
    key: string,
    metadata: Record<string, unknown>,
  ) {
    await this.database.monitorAdminActionLog.create({
      data: {
        adminId,
        action,
        entityType: "EmailDispatchTemplate",
        entityId: key,
        result: "ok",
        metadataJson: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
