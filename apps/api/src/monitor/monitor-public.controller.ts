import type { RawBodyRequest } from "@nestjs/common";
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { MonitorAlertPreferenceService } from "./monitor-alert-preference.service";
import { MonitorDigestWebhookService } from "./monitor-digest-webhook.service";
import { verifyResendWebhookSignature } from "./resend-webhook-verifier";

// Rotas SEM autenticação — deliberadamente numa classe separada de
// MonitorController (que exige JwtAuthGuard + MonitorEntitlementGuard em
// todas as rotas). O webhook do Resend não tem como carregar um Bearer
// token nosso; o unsubscribe precisa funcionar sem login e sem
// entitlement (perder acesso ao Monitor não pode impedir alguém de parar
// de receber e-mail).
@Controller("monitor")
export class MonitorPublicController {
  private readonly logger = new Logger(MonitorPublicController.name);

  constructor(
    @Inject(MonitorDigestWebhookService)
    private readonly webhookService: MonitorDigestWebhookService,
    @Inject(MonitorAlertPreferenceService)
    private readonly alertPreferenceService: MonitorAlertPreferenceService,
  ) {}

  @Post("webhooks/resend")
  async resendWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("svix-id") svixId?: string,
    @Headers("svix-timestamp") svixTimestamp?: string,
    @Headers("svix-signature") svixSignature?: string,
  ) {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret || !req.rawBody) {
      throw new UnauthorizedException("webhook not configured");
    }

    const valid = verifyResendWebhookSignature(
      req.rawBody,
      { svixId, svixTimestamp, svixSignature },
      secret,
    );
    if (!valid || !svixId) {
      throw new UnauthorizedException("invalid webhook signature");
    }

    let payload: { type: string; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      throw new UnauthorizedException("invalid webhook payload");
    }

    const result = await this.webhookService.processEvent(svixId, payload);
    if (!result.processed) {
      this.logger.log(
        `monitor digest webhook not processed: ${result.reason} (type=${payload.type})`,
      );
    }

    return { ok: true };
  }

  // GET NUNCA muta nada — só valida o token e mostra a página de
  // confirmação. Links GET são acessados automaticamente por scanners de
  // segurança de e-mail, preview de clientes de e-mail e ferramentas
  // antiphishing; se GET desativasse o e-mail sozinho, esses acessos
  // automáticos cancelariam a inscrição do usuário sem ele nunca ter
  // clicado em nada. O cancelamento de fato só acontece no POST abaixo
  // (clique explícito no botão da página, ou one-click do RFC 8058).
  @Get("unsubscribe")
  unsubscribeConfirmationPage(
    @Query("token") token: string | undefined,
    @Res() res: Response,
  ) {
    const userId = token
      ? this.alertPreferenceService.verifyUnsubscribeToken(token)
      : null;

    res
      .status(200)
      .type("html")
      .send(renderUnsubscribeConfirmationPage(userId !== null, token ?? ""));
  }

  // Efetiva o cancelamento. Dois callers legítimos batem aqui:
  // (1) o clique humano no botão "Cancelar e-mails" da página acima
  //     (form method="POST"), e
  // (2) o one-click unsubscribe do RFC 8058 — clientes de e-mail
  //     (Gmail, Outlook, etc.) fazem esse POST automaticamente quando o
  //     usuário clica "Cancelar inscrição" na própria interface deles,
  //     sem nunca abrir a página. O corpo desse POST, por especificação,
  //     é `List-Unsubscribe=One-Click` (form-urlencoded) — não validamos
  //     o conteúdo do corpo além do token na query string, só o
  //     aceitamos como um POST válido.
  @Post("unsubscribe")
  async unsubscribe(
    @Query("token") token: string | undefined,
    @Res() res: Response,
    @Body() _body?: Record<string, unknown>,
  ) {
    const updated = token
      ? await this.alertPreferenceService.unsubscribeByToken(token)
      : null;

    res
      .status(200)
      .type("html")
      .send(renderUnsubscribeResultPage(Boolean(updated)));
  }
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} — EarlyCV</title>
  </head>
  <body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f3f2ed;margin:0;padding:48px 16px;">
    <div style="max-width:440px;margin:0 auto;background:#fafaf6;border:1px solid rgba(10,10,10,0.08);border-radius:16px;padding:32px;text-align:center;">
      ${body}
    </div>
  </body>
</html>`;
}

// GET — só oferece o botão; nada foi alterado ainda.
function renderUnsubscribeConfirmationPage(
  valid: boolean,
  token: string,
): string {
  if (!valid) {
    return pageShell(
      "Link inválido",
      `<h1 style="font-size:18px;margin:0 0 12px;color:#0a0a0a;">Link inválido ou expirado</h1>
       <p style="font-size:14px;color:#5a5a55;margin:0;">Não conseguimos validar esse link de descadastro. Se o problema continuar, entre em contato com a gente.</p>`,
    );
  }

  return pageShell(
    "Cancelar e-mails do Alerta de Vaga Certa",
    `<h1 style="font-size:18px;margin:0 0 12px;color:#0a0a0a;">Cancelar e-mails do Alerta de Vaga Certa?</h1>
     <p style="font-size:14px;color:#5a5a55;margin:0 0 20px;">Suas recomendações continuam disponíveis a qualquer momento em earlycv.com.br/alerta-vaga-certa — isso só desliga o aviso por e-mail.</p>
     <form method="POST" action="/api/monitor/unsubscribe?token=${encodeURIComponent(token)}">
       <button type="submit" style="background:#0a0a0a;color:#fafaf6;border:none;border-radius:9px;padding:11px 20px;font-size:13.5px;font-weight:600;cursor:pointer;">Cancelar e-mails</button>
     </form>`,
  );
}

// POST — já efetivou (ou confirmou que já estava cancelado).
function renderUnsubscribeResultPage(success: boolean): string {
  const title = success
    ? "Você não vai mais receber e-mails do Alerta de Vaga Certa"
    : "Link inválido ou expirado";
  const body = success
    ? "Suas recomendações continuam disponíveis a qualquer momento em earlycv.com.br/alerta-vaga-certa — só paramos de te avisar por e-mail."
    : "Não conseguimos processar esse link de descadastro. Se o problema continuar, entre em contato com a gente.";

  return pageShell(
    title,
    `<h1 style="font-size:18px;margin:0 0 12px;color:#0a0a0a;">${title}</h1>
     <p style="font-size:14px;color:#5a5a55;margin:0;">${body}</p>`,
  );
}
