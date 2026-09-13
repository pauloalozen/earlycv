import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import {
  registerSnsWebhookTextBodyParser,
  SNS_WEBHOOK_TEXT_BODY_LIMIT,
} from "../config/sns-text-body-parser";

// Cobre especificamente a correção do parser de corpo do webhook SES/SNS
// (POST /api/monitor/webhooks/ses): a AWS publica notificações com
// Content-Type: text/plain, que o parser default do Nest (json +
// urlencoded) ignora — sem registerSnsWebhookTextBodyParser, req.rawBody
// nunca é populado e todo request real da AWS morre em "missing raw
// body" antes de qualquer validação de assinatura/TopicArn.
//
// Não constrói um fixture SNS genuinamente assinado: verifySnsMessageSignature
// valida o hostname do SigningCertURL contra o domínio oficial da AWS
// ANTES de qualquer fetch (defesa anti-SSRF, ver ses-webhook-verifier.ts)
// — um teste que apontasse pra um hostname de teste local nunca passaria
// dessa checagem, e apontar pra um hostname real da AWS exigiria uma
// notificação de fato assinada pela AWS (inviável de construir aqui). A
// verificação criptográfica em si (RSA contra um certificado real) já
// tem cobertura própria, isolada, em ses-webhook-verifier.spec.ts. Este
// arquivo testa só a camada de parser/roteamento/HTTP — até onde dá pra
// chegar sem uma assinatura real da AWS.

const TEST_TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:earlycv-test-topic";

function parseLimitBytes(limit: string): number {
  const match = limit.match(/^(\d+)kb$/i);
  if (!match) {
    throw new Error(`unexpected limit format in test: ${limit}`);
  }
  return Number(match[1]) * 1024;
}

async function createApp() {
  const previousTopicArn = process.env.AWS_SES_SNS_TOPIC_ARN;
  process.env.AWS_SES_SNS_TOPIC_ARN = TEST_TOPIC_ARN;

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // ATENÇÃO: TestingModule.createNestApplication tem duas sobrecargas —
  // (httpAdapter, options?) ou (options?). Chamar com (undefined, options)
  // cai na primeira sobrecarga tratando `undefined` como httpAdapter e
  // DESCARTA silenciosamente o objeto de options (rawBody nunca é
  // aplicado) — diferente de NestFactory.create(module, options), que não
  // tem essa ambiguidade. Passar só o options aqui é o correto.
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });
  // Mesma função que main.ts chama no bootstrap real — nunca uma
  // reimplementação paralela que poderia divergir e mascarar regressão.
  registerSnsWebhookTextBodyParser(app);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  return {
    app,
    async close() {
      await app.close();
      if (previousTopicArn === undefined) {
        delete process.env.AWS_SES_SNS_TOPIC_ARN;
      } else {
        process.env.AWS_SES_SNS_TOPIC_ARN = previousTopicArn;
      }
    },
  };
}

function snsEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    Type: "Notification",
    MessageId: randomUUID(),
    TopicArn: TEST_TOPIC_ARN,
    Message: JSON.stringify({
      eventType: "Delivery",
      mail: { messageId: "email-1" },
    }),
    Timestamp: new Date().toISOString(),
    SignatureVersion: "1",
    Signature: "not-a-real-signature",
    // Hostname fora do domínio oficial da AWS — falha na camada de
    // validação de hostname, ANTES de qualquer fetch (nunca bate na
    // rede real). É isto que torna "assinatura inválida" determinístico
    // e offline neste teste.
    SigningCertURL: "https://evil.example.com/cert.pem",
    ...overrides,
  };
}

test("text/plain: o corpo chega ao handler — nunca falha com 'missing raw body', avança até a verificação de assinatura", async () => {
  const { app, close } = await createApp();
  try {
    const res = await request(app.getHttpServer())
      .post("/api/monitor/webhooks/ses")
      .set("Content-Type", "text/plain; charset=UTF-8")
      .send(JSON.stringify(snsEnvelope()));

    assert.equal(res.status, 401);
    assert.notEqual(res.body.message, "missing raw body");
    assert.equal(res.body.message, "invalid SNS signature");
  } finally {
    await close();
  }
});

test("text/plain: TopicArn incorreto é rejeitado, antes mesmo de checar a assinatura", async () => {
  const { app, close } = await createApp();
  try {
    const res = await request(app.getHttpServer())
      .post("/api/monitor/webhooks/ses")
      .set("Content-Type", "text/plain; charset=UTF-8")
      .send(
        JSON.stringify(
          snsEnvelope({
            TopicArn: "arn:aws:sns:us-east-1:123456789012:wrong-topic",
          }),
        ),
      );

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "unexpected TopicArn");
  } finally {
    await close();
  }
});

test("text/plain: assinatura inválida é rejeitada (SigningCertURL fora do domínio oficial da AWS — nunca chega a fazer fetch)", async () => {
  const { app, close } = await createApp();
  try {
    const res = await request(app.getHttpServer())
      .post("/api/monitor/webhooks/ses")
      .set("Content-Type", "text/plain; charset=UTF-8")
      .send(
        JSON.stringify(
          snsEnvelope({ SigningCertURL: "https://evil.example.com/cert.pem" }),
        ),
      );

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "invalid SNS signature");
  } finally {
    await close();
  }
});

test("application/json continua funcionando exatamente como antes — o novo parser text/plain não muda esse caminho", async () => {
  const { app, close } = await createApp();
  try {
    const res = await request(app.getHttpServer())
      .post("/api/monitor/webhooks/ses")
      .set("Content-Type", "application/json")
      .send(
        snsEnvelope({
          TopicArn: "arn:aws:sns:us-east-1:123456789012:wrong-topic",
        }),
      );

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "unexpected TopicArn");
  } finally {
    await close();
  }
});

test("webhook do Resend permanece verde — application/json não é afetado pelo novo parser text/plain", async () => {
  const { app, close } = await createApp();
  try {
    const res = await request(app.getHttpServer())
      .post("/api/monitor/webhooks/resend")
      .set("Content-Type", "application/json")
      .send({ type: "email.delivered", data: {} });

    // Sem assinatura svix válida a rota recusa (401) — o que este teste
    // prova é que ela continua processando o corpo JSON normalmente
    // (nunca 404/500), sem nenhuma interferência do parser novo.
    assert.equal(res.status, 401);
  } finally {
    await close();
  }
});

test("text/plain: payload acima do limite configurado é rejeitado", async () => {
  const { app, close } = await createApp();
  try {
    const oversized = "a".repeat(
      parseLimitBytes(SNS_WEBHOOK_TEXT_BODY_LIMIT) + 1024,
    );
    const res = await request(app.getHttpServer())
      .post("/api/monitor/webhooks/ses")
      .set("Content-Type", "text/plain; charset=UTF-8")
      .send(oversized);

    assert.equal(res.status, 413);
  } finally {
    await close();
  }
});

test("text/plain: JSON inválido no envelope retorna 400 (corpo malformado), nunca 500", async () => {
  const { app, close } = await createApp();
  try {
    const res = await request(app.getHttpServer())
      .post("/api/monitor/webhooks/ses")
      .set("Content-Type", "text/plain; charset=UTF-8")
      .send("not json at all");

    assert.equal(res.status, 400);
    assert.equal(res.body.message, "invalid SNS payload");
  } finally {
    await close();
  }
});
