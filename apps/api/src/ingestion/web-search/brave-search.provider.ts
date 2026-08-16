import { Injectable } from "@nestjs/common";
import type { WebSearchProvider, WebSearchResult } from "./web-search.types";

type BraveSearchResponse = {
  web?: {
    results?: {
      description?: string;
      title?: string;
      url?: string;
    }[];
  };
};

@Injectable()
export class BraveSearchProvider implements WebSearchProvider {
  async search(query: string, count: number): Promise<WebSearchResult[]> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error("BRAVE_SEARCH_API_KEY is not configured");
    }

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(
        `Brave Search API returned HTTP ${response.status} for query "${query}"`,
      );
    }

    const data = (await response.json()) as BraveSearchResponse;
    const results = data.web?.results ?? [];

    return results
      .filter((result): result is { title: string; url: string; description?: string } =>
        Boolean(result.title && result.url),
      )
      .map((result) => ({
        snippet: result.description,
        title: result.title,
        url: result.url,
      }));
  }
}
