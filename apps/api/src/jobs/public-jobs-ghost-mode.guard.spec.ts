import assert from "node:assert/strict";
import { test } from "node:test";

import { NotFoundException } from "@nestjs/common";

import type { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RolesGuard } from "../common/roles.guard";
import { PublicJobsGhostModeGuard } from "./public-jobs-ghost-mode.guard";

type AppRole = "none" | "admin" | "superadmin";

type HeaderMap = Record<string, string>;

function buildContext(options?: {
  headers?: HeaderMap;
  role?: AppRole | null;
}) {
  const responseHeaders: HeaderMap = {};
  const request = {
    headers: options?.headers ?? {},
    user:
      options?.role === null
        ? undefined
        : {
            id: "user-1",
            email: "user@earlycv.dev",
            name: "User",
            internalRole: options?.role ?? "admin",
            isStaff: true,
            emailVerifiedAt: new Date().toISOString(),
          },
  };

  const response = {
    setHeader(name: string, value: string) {
      responseHeaders[name] = value;
    },
  };

  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => ({}) as object,
      getClass: () => class Dummy {},
    } as never,
    responseHeaders,
  };
}

function buildGuard(options: { ghostMode: boolean; roleAllowed: boolean }) {
  const jwtCalls = { count: 0 };
  const rolesCalls = { count: 0 };

  const jwtAuthGuard = {
    canActivate: async () => {
      jwtCalls.count += 1;
      return true;
    },
  } as JwtAuthGuard;

  const rolesGuard = {
    canActivate: () => {
      rolesCalls.count += 1;
      if (!options.roleAllowed) {
        throw new Error("forbidden");
      }
      return true;
    },
  } as RolesGuard;

  const guard = new PublicJobsGhostModeGuard(
    {
      JOBS_GHOST_MODE: options.ghostMode,
      API_HOST: "0.0.0.0",
      API_PORT: 4000,
      GOOGLE_CALLBACK_URL: "http://localhost:4000/api/auth/google/callback",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      JWT_ACCESS_SECRET: "access-secret",
      JWT_ACCESS_TTL: 900,
      JWT_REFRESH_SECRET: "refresh-secret",
      JWT_REFRESH_TTL: 2_592_000,
      LINKEDIN_CALLBACK_URL: "http://localhost:4000/api/auth/linkedin/callback",
      LINKEDIN_CLIENT_ID: "linkedin-id",
      LINKEDIN_CLIENT_SECRET: "linkedin-secret",
    },
    jwtAuthGuard,
    rolesGuard,
  );

  return { guard, jwtCalls, rolesCalls };
}

test("ghost ON allows admin", async () => {
  const { context, responseHeaders } = buildContext({ role: "admin" });
  const { guard, jwtCalls, rolesCalls } = buildGuard({
    ghostMode: true,
    roleAllowed: true,
  });

  const result = await guard.canActivate(context);

  assert.equal(result, true);
  assert.equal(jwtCalls.count, 1);
  assert.equal(rolesCalls.count, 1);
  assert.equal(responseHeaders["Cache-Control"], "no-store");
  assert.equal(responseHeaders["X-Robots-Tag"], "noindex, nofollow");
});

test("ghost ON allows superadmin", async () => {
  const { context } = buildContext({ role: "superadmin" });
  const { guard } = buildGuard({ ghostMode: true, roleAllowed: true });

  const result = await guard.canActivate(context);
  assert.equal(result, true);
});

test("ghost ON denies regular user with 404", async () => {
  const { context } = buildContext({ role: "none" });
  const { guard } = buildGuard({ ghostMode: true, roleAllowed: false });

  await assert.rejects(() => guard.canActivate(context), NotFoundException);
});

test("ghost ON denies anonymous with 404", async () => {
  const { context } = buildContext({ role: null });
  const { guard } = buildGuard({ ghostMode: true, roleAllowed: false });

  await assert.rejects(() => guard.canActivate(context), NotFoundException);
});

test("ghost OFF allows anonymous and skips auth checks", async () => {
  const { context, responseHeaders } = buildContext({ role: null });
  const { guard, jwtCalls, rolesCalls } = buildGuard({
    ghostMode: false,
    roleAllowed: false,
  });

  const result = await guard.canActivate(context);

  assert.equal(result, true);
  assert.equal(jwtCalls.count, 0);
  assert.equal(rolesCalls.count, 0);
  assert.equal(responseHeaders["Cache-Control"], undefined);
  assert.equal(responseHeaders["X-Robots-Tag"], undefined);
});
