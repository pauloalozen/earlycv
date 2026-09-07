import { Inject, Injectable, Logger } from "@nestjs/common";
import { GoogleAuth } from "google-auth-library";

import { DatabaseService } from "../database/database.service";

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const INDEXING_ENDPOINT =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";

type IndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

// Sem @nestjs/config no projeto (não é dependência instalada) — segue o
// padrão já usado em todo o resto da API pra URL pública (ver
// auth.service.ts, payment-recovery-email.service.ts): ler process.env
// direto, com fallback pro domínio de produção sem "www.".
function buildJobUrl(slug: string): string {
  const frontendUrl = process.env.FRONTEND_URL ?? "https://earlycv.com.br";
  return `${frontendUrl}/radar/${slug}`;
}

// Notifica o Google Indexing API quando uma vaga é publicada ou deixa de ser
// publicável — pede recrawl/deindexação mais rápido que esperar o Googlebot
// visitar o sitemap por conta própria. Nunca deve derrubar o fluxo que a
// chama (ingestão de vagas, lifecycle de status): toda falha é capturada,
// logada e registrada em GoogleIndexingLog, nunca propagada.
@Injectable()
export class GoogleIndexingService {
  private readonly logger = new Logger(GoogleIndexingService.name);
  private readonly enabled = process.env.GOOGLE_INDEXING_ENABLED === "true";
  private authClient: GoogleAuth | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // quotaExceeded avisa quem chama que a cota DIARIA da Indexing API
  // estourou (ver GoogleIndexingBackfillService.runBackfillBatch, que para
  // o lote assim que ve isso em vez de continuar gastando o resto do lote
  // em chamadas que sabidamente vao falhar do mesmo jeito).
  async notifyIndexing(
    slug: string,
  ): Promise<{ ok: boolean; quotaExceeded: boolean }> {
    return this.notify(slug, "URL_UPDATED");
  }

  async notifyRemoval(
    slug: string,
  ): Promise<{ ok: boolean; quotaExceeded: boolean }> {
    return this.notify(slug, "URL_DELETED");
  }

  private getAuthClient(): GoogleAuth {
    if (!this.authClient) {
      this.authClient = new GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          // Chaves de service account vêm de env var com \n escapado
          // literalmente (não quebra de linha real) — precisa desfazer isso
          // antes do JWT client conseguir parsear a chave PEM.
          private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
            /\\n/g,
            "\n",
          ),
        },
        scopes: [INDEXING_SCOPE],
      });
    }
    return this.authClient;
  }

  private async notify(
    slug: string,
    type: IndexingNotificationType,
  ): Promise<{ ok: boolean; quotaExceeded: boolean }> {
    if (!this.enabled) return { ok: false, quotaExceeded: false };

    const url = buildJobUrl(slug);

    try {
      const client = await this.getAuthClient().getClient();
      await client.request({
        url: INDEXING_ENDPOINT,
        method: "POST",
        data: { url, type },
      });

      await this.database.googleIndexingLog.create({
        data: { slug, type, status: "SUCCESS" },
      });
      return { ok: true, quotaExceeded: false };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message.slice(0, 500) : "unknown error";
      this.logger.error(
        `Google Indexing API notify failed for slug=${slug} type=${type}: ${errorMsg}`,
      );

      await this.database.googleIndexingLog
        .create({ data: { slug, type, status: "ERROR", errorMsg } })
        .catch((logError: unknown) => {
          this.logger.error(
            `Failed to persist GoogleIndexingLog for slug=${slug}: ${logError instanceof Error ? logError.message : "unknown error"}`,
          );
        });

      // Mensagem exata da Indexing API pra cota diaria estourada (achado
      // real: "Quota exceeded for quota metric 'Publish requests' and
      // limit 'Publish requests per day'...") — distingue de outros erros
      // (403 transitorio, URL invalida) que nao justificam parar o lote.
      const quotaExceeded =
        /quota exceeded/i.test(errorMsg) && /per day/i.test(errorMsg);
      return { ok: false, quotaExceeded };
    }
  }
}
