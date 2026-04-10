export type AdaptarMode = "master" | "upload";

export function buildAdaptarMode(payload: {
  hasMasterResume: boolean;
}): AdaptarMode {
  return payload.hasMasterResume ? "master" : "upload";
}
