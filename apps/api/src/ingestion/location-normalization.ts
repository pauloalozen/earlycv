import { normalizeCity } from "../jobs/geo-normalizer";
import { parseJobLocations } from "../jobs/location-parser";
import type { NormalizedJobObservation } from "./types";

const REMOTE_WORDS = new Set([
  "remote",
  "remoto",
  "remota",
  "teletrabalho",
  "homeoffice",
  "home",
  "office",
  "anywhere",
]);
// Pode acompanhar a palavra de remoto sem mudar o sentido ("Remote,
// Brazil", "100% Remoto", "Home Office - Brasil").
const REMOTE_FILLER = new Set([
  "100",
  "br",
  "bra",
  "brasil",
  "brazil",
  "based",
]);

// Localização só de remoto ("Remote", "Remoto, Brasil", "Home Office"):
// a vaga é remota mesmo quando o adapter não mandou workModel.
export function isRemoteOnlyLocation(text: string | null | undefined): boolean {
  const tokens = (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!tokens.some((token) => REMOTE_WORDS.has(token))) return false;
  return tokens.every(
    (token) => REMOTE_WORDS.has(token) || REMOTE_FILLER.has(token),
  );
}

// Cidade e UF canônicas (grafia do IBGE) pelo parser de localização,
// preenchendo também vaga que só trazia a cidade no texto livre
// ("Brazil - Sao Paulo", "BR-CWB-009"). Sem cidade reconhecida, fica o que
// o adapter mandou, com os conectivos em minúscula.
export function withNormalizedLocation(
  observation: NormalizedJobObservation,
): NormalizedJobObservation {
  const [primary] = parseJobLocations({
    city: observation.city,
    country: observation.country,
    locationText: observation.locationText,
    state: observation.state,
  });
  const workModel =
    (!observation.workModel || observation.workModel === "onsite") &&
    isRemoteOnlyLocation(observation.locationText)
      ? "remote"
      : observation.workModel;

  return {
    ...observation,
    city: primary?.city ?? normalizeCity(observation.city) ?? undefined,
    state: primary?.state ?? observation.state,
    workModel,
  };
}
