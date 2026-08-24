export type LandingVariant = "A" | "B" | "C" | "D" | "E" | "F";

export function resolveLandingVariant(
  rawVariant: string | undefined,
): LandingVariant {
  if (rawVariant === "B") return "B";
  if (rawVariant === "C") return "C";
  if (rawVariant === "D") return "D";
  if (rawVariant === "E") return "E";
  if (rawVariant === "F") return "F";
  return "A";
}
