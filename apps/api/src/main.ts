import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { loadAppEnv, loadLocalEnvFileIfPresent } from "./config/env.module";

async function bootstrap() {
  loadLocalEnvFileIfPresent();

  const app = await NestFactory.create(AppModule);
  const env = await loadAppEnv();

  app.setGlobalPrefix("api");

  await app.listen(env.API_PORT, env.API_HOST);
}

void bootstrap();
