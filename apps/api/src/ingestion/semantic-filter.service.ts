import { Inject, Injectable, Optional } from "@nestjs/common";
import type { SemanticFilterConfig } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type SemanticFilterDecision = {
  configVersion: string;
  reason: string;
  result: "ENRICH" | "SKIP";
};

type SemanticFilterServiceOptions = {
  cacheTtlMs?: number;
  now?: () => number;
};

export const SEMANTIC_FILTER_SERVICE_OPTIONS =
  "SEMANTIC_FILTER_SERVICE_OPTIONS";

function stripAccents(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function stripGeographicSuffix(value: string) {
  const dashIndex = value.indexOf(" - ");
  if (dashIndex === -1) return value;
  return value.slice(0, dashIndex);
}

function normalizeTitleForFilter(value: string) {
  const withoutParens = value.replace(/\([^)]*\)/g, " ");
  const normalized = stripAccents(withoutParens).toLowerCase().trim();
  return stripGeographicSuffix(normalized).replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Conectores ignorados na tokenizacao de sinais compostos — "suporte de ti"
// e "suporte ti" devem casar do mesmo jeito, entao "de" nao pode ser um
// token obrigatorio.
const STOPWORDS = new Set([
  "a",
  "as",
  "com",
  "da",
  "das",
  "de",
  "dos",
  "do",
  "e",
  "em",
  "o",
  "os",
  "para",
]);

function tokenize(value: string) {
  return value
    .split(/[^a-z0-9]+/i)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

// Casa um token do sinal com um token do titulo tolerando abreviacao
// ("tec" -> "tecnico") via prefixo nos dois sentidos. Exige >=3 chars no
// menor dos dois pra nao deixar token curto (ex: "i", "ti") casar com
// qualquer coisa que comece igual.
function tokensMatch(signalToken: string, titleToken: string) {
  if (signalToken === titleToken) return true;
  if (signalToken.length < 3 || titleToken.length < 3) return false;
  return (
    titleToken.startsWith(signalToken) || signalToken.startsWith(titleToken)
  );
}

// Sinais compostos (com espaco, ex: "suporte de ti", "product manager")
// casam por conjunto de tokens, independente de ordem e tolerando
// abreviacao por prefixo — assim "tecnico de suporte", "tec de suporte" e
// "suporte tecnico" casam com o mesmo sinal sem precisar cadastrar cada
// variacao de frase.
function matchesMultiWordSignal(title: string, signal: string) {
  const signalTokens = tokenize(signal);
  if (signalTokens.length === 0) return false;

  const titleTokens = tokenize(title);
  return signalTokens.every((signalToken) =>
    titleTokens.some((titleToken) => tokensMatch(signalToken, titleToken)),
  );
}

// Sinais curtos de uma palavra so (<=3 chars, ex: "ux", "cio", "ia", "bi")
// precisam de word boundary — senao "ux" casa dentro de "auxiliar" e "cio"
// dentro de "internacional". Sinais de uma palavra com 4+ chars mantem
// substring simples, que ja funciona bem pra termos como
// "desenvolvedor"/"engenheiro" e cobre variacoes (plural, prefixos) sem
// precisar de boundary.
function matchesSignal(title: string, signal: string) {
  const normalizedSignal = signal.trim().toLowerCase();
  if (!normalizedSignal) return false;

  if (normalizedSignal.includes(" ")) {
    return matchesMultiWordSignal(title, normalizedSignal);
  }

  if (normalizedSignal.length <= 3) {
    const regex = new RegExp(
      `(?:^|\\s)${escapeRegex(normalizedSignal)}(?:\\s|$)`,
      "i",
    );
    return regex.test(title);
  }

  return title.includes(normalizedSignal);
}

@Injectable()
export class SemanticFilterService {
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cache: { config: SemanticFilterConfig; expiresAt: number } | null =
    null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(SEMANTIC_FILTER_SERVICE_OPTIONS)
    options: SemanticFilterServiceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
  }

  async getActiveConfig(): Promise<SemanticFilterConfig> {
    const cached = this.cache;
    if (cached && cached.expiresAt > this.now()) {
      return cached.config;
    }

    const config = await this.database.semanticFilterConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      throw new Error("No active SemanticFilterConfig found");
    }

    this.cache = { config, expiresAt: this.now() + this.cacheTtlMs };
    return config;
  }

  invalidateCache() {
    this.cache = null;
  }

  async evaluate(normalizedTitle: string): Promise<SemanticFilterDecision> {
    const config = await this.getActiveConfig();
    const title = normalizeTitleForFilter(normalizedTitle);

    const noiseSignal = config.noiseSignals.find((signal) =>
      matchesSignal(title, signal),
    );
    if (noiseSignal) {
      return {
        configVersion: config.version,
        reason: `noise_signal:${noiseSignal}`,
        result: "SKIP",
      };
    }

    const techSignal = config.techSignals.find((signal) =>
      matchesSignal(title, signal),
    );
    if (techSignal) {
      return {
        configVersion: config.version,
        reason: `tech_signal:${techSignal}`,
        result: "ENRICH",
      };
    }

    return {
      configVersion: config.version,
      reason: "zona_cinza",
      result: "SKIP",
    };
  }
}
