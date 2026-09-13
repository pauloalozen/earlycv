import type { NestExpressApplication } from "@nestjs/platform-express";

// Amazon SNS publica notificações HTTP(S) com
// `Content-Type: text/plain; charset=UTF-8` — comportamento fixo da AWS,
// não configurável do lado de quem assina o tópico. O parser default do
// Nest (express.json + express.urlencoded, ver registerParserMiddleware
// em @nestjs/platform-express) só processa `application/json` e
// `application/x-www-form-urlencoded` — sem isto, req.rawBody nunca é
// populado pra uma notificação SNS real, e
// MonitorPublicController.sesWebhook rejeita tudo com "missing raw body"
// antes mesmo de validar assinatura/TopicArn.
//
// Restrito a text/plain, de propósito: nunca reconfigura
// `application/json` (que já funciona via o parser default) nem o
// webhook do Resend (que envia Content-Type: application/json).
//
// Limite conservador: 256kb é o teto de tamanho que o próprio SNS aplica
// à mensagem publicada — a notificação inteira (envelope + Message)
// nunca deveria passar disso; qualquer coisa maior é corpo malformado ou
// hostil, nunca processado.
export const SNS_WEBHOOK_TEXT_BODY_LIMIT = "256kb";

// Extraído numa função própria (em vez de inline no bootstrap) pra que o
// teste e2e do webhook SES/SNS registre EXATAMENTE o mesmo parser que a
// produção usa — nunca uma reimplementação paralela que poderia divergir
// e mascarar uma regressão real.
export function registerSnsWebhookTextBodyParser(app: NestExpressApplication) {
  app.useBodyParser("text", {
    type: "text/plain",
    limit: SNS_WEBHOOK_TEXT_BODY_LIMIT,
  });
}
