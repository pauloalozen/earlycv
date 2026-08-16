export type WebSearchResult = {
  snippet?: string;
  title: string;
  url: string;
};

export type WebSearchProvider = {
  search(query: string, count: number): Promise<WebSearchResult[]>;
};
