import { Inject, Injectable } from "@nestjs/common";
import { BraveSearchProvider } from "./brave-search.provider";
import type { WebSearchProvider, WebSearchResult } from "./web-search.types";

const DEFAULT_RESULTS_COUNT = 10;

// Fachada agnostica de provedor — pra trocar de fornecedor de busca so
// precisa de uma nova classe WebSearchProvider e um novo `case` aqui, sem
// mexer no restante do fluxo de Descoberta de Empresas (ver
// discovered-companies.service.ts). Hoje so tem Brave implementado.
@Injectable()
export class WebSearchService {
  constructor(
    @Inject(BraveSearchProvider)
    private readonly braveSearchProvider: BraveSearchProvider,
  ) {}

  isEnabled(): boolean {
    if (process.env.WEB_SEARCH_ENABLED !== "true") return false;

    switch (this.getProviderName()) {
      case "brave":
        return Boolean(process.env.BRAVE_SEARCH_API_KEY);
      default:
        return false;
    }
  }

  getMaxQueriesPerRun(): number {
    const raw = Number.parseInt(
      process.env.WEB_SEARCH_MAX_QUERIES_PER_RUN ?? "",
      10,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  }

  async search(query: string): Promise<WebSearchResult[]> {
    const count = Number.parseInt(
      process.env.WEB_SEARCH_RESULTS_COUNT ?? "",
      10,
    );
    return this.getProvider().search(
      query,
      Number.isFinite(count) && count > 0 ? count : DEFAULT_RESULTS_COUNT,
    );
  }

  private getProviderName(): string {
    return process.env.WEB_SEARCH_PROVIDER ?? "brave";
  }

  private getProvider(): WebSearchProvider {
    switch (this.getProviderName()) {
      case "brave":
        return this.braveSearchProvider;
      default:
        throw new Error(
          `unknown WEB_SEARCH_PROVIDER: ${this.getProviderName()}`,
        );
    }
  }
}
