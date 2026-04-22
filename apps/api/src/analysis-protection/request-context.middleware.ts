import { createHash, randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import type { AnalysisRequestContext } from "./types";

const SESSION_COOKIE_KEYS = [
  "analysis_session_token",
  "analysisSessionToken",
] as const;

const MAX_CORRELATION_ID_LENGTH = 128;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

function parseBooleanLikeValue(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }

  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }

  return null;
}

function pickFirstHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const candidate of value) {
      const trimmed = candidate.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function hasTrustedProxy(req: Request): boolean {
  const trustProxy = req.app?.get("trust proxy");

  if (typeof trustProxy === "boolean") {
    return trustProxy;
  }

  if (typeof trustProxy === "number") {
    return trustProxy > 0;
  }

  if (typeof trustProxy === "string") {
    const parsedBoolean = parseBooleanLikeValue(trustProxy);
    return parsedBoolean ?? trustProxy.trim().length > 0;
  }

  if (Array.isArray(trustProxy)) {
    for (const value of trustProxy) {
      const parsedBoolean = parseBooleanLikeValue(String(value));

      if (parsedBoolean !== null) {
        return parsedBoolean;
      }
    }

    return trustProxy.length > 0;
  }

  return typeof trustProxy === "function";
}

function resolveIp(req: Request): string | null {
  if (hasTrustedProxy(req)) {
    const forwardedChain = pickFirstHeaderValue(req.headers["x-forwarded-for"]);

    if (forwardedChain) {
      const [firstHop] = forwardedChain.split(",");
      const forwardedIp = firstHop?.trim();

      if (forwardedIp) {
        return forwardedIp;
      }
    }
  }

  if (req.ip) {
    const trimmedIp = req.ip.trim();

    if (trimmedIp.length > 0) {
      return trimmedIp;
    }
  }

  const remoteAddress = req.socket?.remoteAddress?.trim();
  return remoteAddress && remoteAddress.length > 0 ? remoteAddress : null;
}

function resolveSessionPublicToken(req: Request): string | null {
  const cookies: Record<string, unknown> = {};

  if (req.cookies && typeof req.cookies === "object") {
    Object.assign(cookies, req.cookies);
  }

  const cookieHeader = pickFirstHeaderValue(req.headers.cookie);

  if (cookieHeader) {
    for (const pair of cookieHeader.split(";")) {
      const separatorIndex = pair.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();

      if (key.length === 0 || value.length === 0 || key in cookies) {
        continue;
      }

      cookies[key] = value;
    }
  }

  for (const key of SESSION_COOKIE_KEYS) {
    const value = cookies[key];

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function sanitizeCorrelationId(
  value: string | string[] | undefined,
): string | null {
  const candidate = pickFirstHeaderValue(value);

  if (!candidate) {
    return null;
  }

  if (candidate.length > MAX_CORRELATION_ID_LENGTH) {
    return null;
  }

  if (!CORRELATION_ID_PATTERN.test(candidate)) {
    return null;
  }

  return candidate;
}

function resolveRoutePath(req: Request): string | null {
  const source =
    (typeof req.originalUrl === "string" && req.originalUrl) ||
    (typeof req.url === "string" && req.url) ||
    "";
  const trimmed = source.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const [path] = trimmed.split("?");

  if (!path) {
    return null;
  }

  return path;
}

function resolveUserAgentHash(req: Request): string | null {
  const userAgent = pickFirstHeaderValue(req.headers["user-agent"]);

  if (!userAgent) {
    return null;
  }

  return createHash("sha256").update(userAgent).digest("hex");
}

export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const correlationId = sanitizeCorrelationId(req.headers["x-correlation-id"]);

  const context: AnalysisRequestContext = {
    requestId: randomUUID(),
    correlationId: correlationId ?? randomUUID(),
    sessionPublicToken: resolveSessionPublicToken(req),
    sessionInternalId: null,
    userId: null,
    ip: resolveIp(req),
    routePath: resolveRoutePath(req),
    userAgentHash: resolveUserAgentHash(req),
  };

  req.analysisContext = context;
  next();
}
