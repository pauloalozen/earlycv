import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { Global, Module } from "@nestjs/common";

export type EnvSource = Record<string, string | undefined>;

export type AppEnv = {
  API_HOST: string;
  API_PORT: number;
};

export const APP_ENV = Symbol("APP_ENV");

function getLocalEnvCandidates(cwd: string) {
  return [resolve(cwd, ".env"), resolve(cwd, "../../.env")];
}

export function loadLocalEnvFileIfPresent(cwd = process.cwd()) {
  for (const candidate of getLocalEnvCandidates(cwd)) {
    if (existsSync(candidate)) {
      loadEnvFile(candidate);

      return candidate;
    }
  }

  return null;
}

export async function loadAppEnv(source?: EnvSource): Promise<AppEnv> {
  const { defineEnv, envToNumber } = await import("@earlycv/config/env");
  const readEnv = defineEnv({
    API_HOST: {
      default: "0.0.0.0",
    },
    API_PORT: {
      default: "4000",
      parse: (value: string, key: string) => envToNumber(value, key),
    },
  });

  const env = readEnv(source);

  return {
    API_HOST: env.API_HOST as string,
    API_PORT: env.API_PORT,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: loadAppEnv,
    },
  ],
  exports: [APP_ENV],
})
export class EnvModule {}
