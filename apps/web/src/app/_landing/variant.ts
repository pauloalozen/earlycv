export type LandingVariant = "A" | "B";

export function resolveLandingVariant(
  rawVariant: string | undefined,
): LandingVariant {
  return rawVariant === "B" ? "B" : "A";
}
