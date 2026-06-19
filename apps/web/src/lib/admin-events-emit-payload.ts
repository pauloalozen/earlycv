import type { EmitAdminAnalysisEventsPayload } from "./admin-analysis-events-api";

export function resolveEmitPayload(
  formData: FormData,
): EmitAdminAnalysisEventsPayload {
  const mode = String(formData.get("mode") ?? "").trim();

  if (mode === "single") {
    const eventName = String(formData.get("eventName") ?? "").trim();
    if (!eventName) {
      throw new Error("eventName is required for single mode");
    }

    return {
      eventName,
      mode: "single",
    };
  }

  if (mode === "group") {
    const group = formData.get("group");
    if (group !== "protection" && group !== "business") {
      throw new Error("Grupo invalido para disparo.");
    }

    return {
      group,
      mode: "group",
    };
  }

  if (mode === "list") {
    const eventNames = formData
      .getAll("eventNames")
      .map(String)
      .map((n) => n.trim())
      .filter(Boolean);

    if (eventNames.length === 0) {
      throw new Error("eventNames is required for list mode");
    }

    return { mode: "list", eventNames };
  }

  if (mode !== "all") {
    throw new Error("Modo invalido para disparo.");
  }

  return { mode: "all" };
}
