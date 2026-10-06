import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";

import { requestContextMiddleware } from "./analysis-protection/request-context.middleware";
import { AppModule } from "./app.module";
import { startMallocTrim } from "./common/malloc-trim";
import { startMemoryDiagnostics } from "./common/memory-diagnostics";
import { loadAppEnv, loadLocalEnvFileIfPresent } from "./config/env.module";
import { registerSnsWebhookTextBodyParser } from "./config/sns-text-body-parser";

function buildCorsOrigins(): string[] {
  const extra = process.env.CORS_ORIGINS;
  const base = ["http://localhost:3000"];
  if (!extra) return base;
  return [
    ...base,
    ...extra
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];
}

async function bootstrap() {
  loadLocalEnvFileIfPresent();

  // rawBody: true preserva o corpo bruto da request em req.rawBody (Buffer)
  // ao lado do corpo já parseado — necessário pro webhook do Resend
  // (assinatura Svix é HMAC sobre os bytes crus, não sobre o JSON
  // re-serializado, que pode divergir byte a byte do que foi assinado).
  // Aditivo: não muda nenhum comportamento de rota existente.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const env = await loadAppEnv();

  // Parser adicional, restrito a text/plain, pro webhook SNS do SES (ver
  // sns-text-body-parser.ts) — SNS envia notificações com esse
  // Content-Type, que o parser default acima (json/urlencoded) ignora.
  registerSnsWebhookTextBodyParser(app);

  app.use(helmet());

  app.enableCors({
    credentials: true,
    origin: buildCorsOrigins(),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.use(requestContextMiddleware);

  await app.listen(env.API_PORT, env.API_HOST);

  // Diagnostico temporario de memoria; no-op sem MEMORY_DIAGNOSTICS_ENABLED=true.
  startMemoryDiagnostics();

  // Devolve ao SO, de hora em hora, a memoria que o glibc segura apos picos
  // do engine do Prisma; desliga com MALLOC_TRIM_ENABLED=false.
  void startMallocTrim();
}

void bootstrap();
