import { Inject, Injectable, Logger } from "@nestjs/common";
import { GoogleAuth } from "google-auth-library";

import { DatabaseService } from "../database/database.service";

const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const INDEXING_ENDPOINT =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";

export type IndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

// Sem @nestjs/config no projeto (não é dependência instalada) — segue o
// padrão já usado em todo o resto da API pra URL pública (ver
// auth.service.ts, payment-recovery-email.service.ts): ler process.env
// direto, com fallback pro domínio de produção sem "www.".
export function buildJobUrl(slug: string): string {
  const frontendUrl = process.env.FRONTEND_URL ?? "https://earlycv.com.br";
  return `${frontendUrl}/radar/${slug}`;
}

// Cliente da Google Indexing API: pede recrawl/deindexação mais rápido que
// esperar o Googlebot visitar o sitemap. Só é chamado pelo
// GoogleIndexingQueueWorker; quem precisa notificar enfileira em
// GoogleIndexingQueueService. Toda falha é capturada, logada e registrada em
// GoogleIndexingLog, nunca propagada.
@Injectable()
export class GoogleIndexingService {
  private readonly logger = new Logger(GoogleIndexingService.name);
  private readonly enabled = process.env.GOOGLE_INDEXING_ENABLED === "true";
  private authClient: GoogleAuth | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  isEnabled(): boolean {
    return this.enabled;
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

  // quotaExceeded avisa o worker que a cota DIARIA da Indexing API estourou:
  // ele para a execução em vez de gastar as próximas pendências em chamadas
  // que sabidamente vão falhar do mesmo jeito.
  async send(input: {
    slug: string;
    url: string;
    type: IndexingNotificationType;
  }): Promise<{ ok: boolean; quotaExceeded: boolean; error: string | null }> {
    const { slug, type, url } = input;
    if (!this.enabled) {
      return { error: "indexing disabled", ok: false, quotaExceeded: false };
    }

    try {
      const client = await this.getAuthClient().getClient();
      await client.request({
        url: INDEXING_ENDPOINT,
        method: "POST",
        data: { url, type },
      });

      await this.database.googleIndexingLog.create({
        data: { slug, status: "SUCCESS", type, url },
      });
      return { error: null, ok: true, quotaExceeded: false };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message.slice(0, 500) : "unknown error";
      this.logger.error(
        `Google Indexing API notify failed for slug=${slug} type=${type}: ${errorMsg}`,
      );

      await this.database.googleIndexingLog
        .create({ data: { errorMsg, slug, status: "ERROR", type, url } })
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
      return { error: errorMsg, ok: false, quotaExceeded };
    }
  }
}
