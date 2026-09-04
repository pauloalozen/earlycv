export type LandingVariant = "A" | "B" | "C" | "D" | "E" | "F" | "F2";

export function resolveLandingVariant(
  rawVariant: string | undefined,
): LandingVariant {
  if (rawVariant === "B") return "B";
  if (rawVariant === "C") return "C";
  if (rawVariant === "D") return "D";
  if (rawVariant === "E") return "E";
  if (rawVariant === "F") return "F";
  if (rawVariant === "F2") return "F2";
  return "A";
}
