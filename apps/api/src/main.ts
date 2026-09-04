import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";

import { requestContextMiddleware } from "./analysis-protection/request-context.middleware";
import { AppModule } from "./app.module";
import { loadAppEnv, loadLocalEnvFileIfPresent } from "./config/env.module";

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
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const env = await loadAppEnv();

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
}

void bootstrap();
