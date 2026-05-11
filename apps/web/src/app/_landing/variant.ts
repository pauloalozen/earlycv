export type LandingVariant = "A" | "B" | "C";

export function resolveLandingVariant(
  rawVariant: string | undefined,
): LandingVariant {
  if (rawVariant === "B") return "B";
  if (rawVariant === "C") return "C";
  return "A";
}
