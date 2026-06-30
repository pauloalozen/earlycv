import type { JobApplicationStatus } from "./job-applications-api";

export type StatusConfig = {
  label: string;
  bg: string;
  color: string;
  border: string;
  dot: string;
  dotGlow?: boolean;
};

export type UserVisibleStatusKey =
  | "SAVED"
  | "ANALYZED"
  | "CV_READY"
  | "APPLIED"
  | "INTERVIEW"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN";

export const STATUS_CONFIG: Record<JobApplicationStatus, StatusConfig> = {
  SAVED: {
    label: "Salva",
    bg: "#fff",
    color: "#3a3a36",
    border: "rgba(10,10,10,0.10)",
    dot: "#a8a6a0",
  },
  ANALYZED: {
    label: "Analisada",
    bg: "#fff",
    color: "#3a3a36",
    border: "rgba(10,10,10,0.10)",
    dot: "#a8a6a0",
  },
  CV_READY: {
    label: "CV Liberado",
    bg: "rgba(198,255,58,0.28)",
    color: "#3a5008",
    border: "rgba(110,150,20,0.30)",
    dot: "#7aa811",
    dotGlow: true,
  },
  APPLIED: {
    label: "Candidatado",
    bg: "#0a0a0a",
    color: "#fafaf6",
    border: "#0a0a0a",
    dot: "#c6ff3a",
    dotGlow: true,
  },
  IN_PROCESS: {
    label: "Em processo",
    bg: "rgba(245,197,24,0.18)",
    color: "#7a5a04",
    border: "rgba(180,140,10,0.25)",
    dot: "#f5c518",
  },
  INTERVIEW: {
    label: "Em entrevista",
    bg: "rgba(245,197,24,0.18)",
    color: "#7a5a04",
    border: "rgba(180,140,10,0.25)",
    dot: "#f5c518",
  },
  ASSESSMENT: {
    label: "Teste / case",
    bg: "rgba(245,197,24,0.18)",
    color: "#7a5a04",
    border: "rgba(180,140,10,0.25)",
    dot: "#f5c518",
  },
  OFFER: {
    label: "Oferta",
    bg: "rgba(198,255,58,0.28)",
    color: "#3a5008",
    border: "rgba(110,150,20,0.30)",
    dot: "#7aa811",
    dotGlow: true,
  },
  HIRED: {
    label: "Contratado",
    bg: "rgba(198,255,58,0.28)",
    color: "#3a5008",
    border: "rgba(110,150,20,0.30)",
    dot: "#7aa811",
    dotGlow: true,
  },
  REJECTED: {
    label: "Recusado",
    bg: "rgba(10,10,10,0.04)",
    color: "#8a8a85",
    border: "rgba(10,10,10,0.08)",
    dot: "#c0beb4",
  },
  WITHDRAWN: {
    label: "Desistência",
    bg: "rgba(10,10,10,0.04)",
    color: "#8a8a85",
    border: "rgba(10,10,10,0.08)",
    dot: "#c0beb4",
  },
};

export const ALL_STATUSES: JobApplicationStatus[] = [
  "SAVED",
  "ANALYZED",
  "CV_READY",
  "APPLIED",
  "IN_PROCESS",
  "INTERVIEW",
  "ASSESSMENT",
  "OFFER",
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];

export const OPEN_STATUSES: JobApplicationStatus[] = [
  "SAVED",
  "ANALYZED",
  "CV_READY",
];

export const IN_PROCESS_STATUSES: JobApplicationStatus[] = [
  "APPLIED",
  "IN_PROCESS",
  "INTERVIEW",
  "ASSESSMENT",
  "OFFER",
];

export const CLOSED_STATUSES: JobApplicationStatus[] = [
  "HIRED",
  "REJECTED",
  "WITHDRAWN",
];

export function getUserVisibleStatus(
  status: JobApplicationStatus,
): UserVisibleStatusKey {
  if (
    status === "IN_PROCESS" ||
    status === "ASSESSMENT" ||
    status === "OFFER"
  ) {
    return "INTERVIEW";
  }

  return status;
}

export function getStatusConfig(status: string): StatusConfig {
  const visibleStatus = getUserVisibleStatus(status as JobApplicationStatus);
  return (
    STATUS_CONFIG[visibleStatus] ?? {
      label: status,
      bg: "#fff",
      color: "#3a3a36",
      border: "rgba(10,10,10,0.10)",
      dot: "#a8a6a0",
    }
  );
}
