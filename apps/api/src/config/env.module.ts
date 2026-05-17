import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

import { Global, Module } from "@nestjs/common";

export type EnvSource = Record<string, string | undefined>;

export type AppEnv = {
  API_HOST: string;
  API_PORT: number;
  LINKEDIN_CALLBACK_URL: string;
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: number;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_TTL: number;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
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
    JWT_ACCESS_SECRET: {},
    JWT_ACCESS_TTL: {
      default: "900",
      parse: (value: string, key: string) => envToNumber(value, key),
    },
    JWT_REFRESH_SECRET: {},
    JWT_REFRESH_TTL: {
      default: "2592000",
      parse: (value: string, key: string) => envToNumber(value, key),
    },
    GOOGLE_CLIENT_ID: {},
    GOOGLE_CLIENT_SECRET: {},
    GOOGLE_CALLBACK_URL: {},
    LINKEDIN_CLIENT_ID: {},
    LINKEDIN_CLIENT_SECRET: {},
    LINKEDIN_CALLBACK_URL: {},
  });

  const env = readEnv(source);

  return {
    API_HOST: env.API_HOST as string,
    API_PORT: env.API_PORT,
    GOOGLE_CALLBACK_URL: env.GOOGLE_CALLBACK_URL as string,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID as string,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET as string,
    LINKEDIN_CALLBACK_URL: env.LINKEDIN_CALLBACK_URL as string,
    LINKEDIN_CLIENT_ID: env.LINKEDIN_CLIENT_ID as string,
    LINKEDIN_CLIENT_SECRET: env.LINKEDIN_CLIENT_SECRET as string,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET as string,
    JWT_ACCESS_TTL: env.JWT_ACCESS_TTL,
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET as string,
    JWT_REFRESH_TTL: env.JWT_REFRESH_TTL,
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
