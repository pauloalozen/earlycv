type BuildCvUnlockPlansHrefInput = {
  adaptationId: string | null | undefined;
  source: string;
  nextPath?: string;
  keywords?: string[];
};

export function buildCvUnlockPlansHref({
  adaptationId,
  source,
  nextPath,
  keywords,
}: BuildCvUnlockPlansHrefInput): string {
  const aid = adaptationId?.trim() ?? "";
  if (!aid) return "/planos";

  const params = new URLSearchParams({
    aid,
    source,
  });

  const next = nextPath?.trim();
  if (next) params.set("next", next);

  for (const rawKeyword of keywords ?? []) {
    const keyword = rawKeyword.trim();
    if (keyword) params.append("kw", keyword);
  }

  return `/planos?${params.toString()}`;
}
