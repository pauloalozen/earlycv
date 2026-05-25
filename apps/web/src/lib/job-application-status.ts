import type { JobApplicationStatus } from "./job-applications-api";

export type StatusConfig = {
  label: string;
  bg: string;
  color: string;
  border: string;
};

export const STATUS_CONFIG: Record<JobApplicationStatus, StatusConfig> = {
  SAVED: {
    label: "Salva",
    bg: "rgba(10,10,10,0.05)",
    color: "#6a6560",
    border: "transparent",
  },
  ANALYZED: {
    label: "Analisada",
    bg: "rgba(10,10,10,0.05)",
    color: "#6a6560",
    border: "transparent",
  },
  CV_READY: {
    label: "CV Pronto",
    bg: "rgba(198,255,58,0.16)",
    color: "#405410",
    border: "rgba(110,150,20,0.20)",
  },
  APPLIED: {
    label: "Enviada",
    bg: "rgba(10,10,10,0.07)",
    color: "#0a0a0a",
    border: "rgba(10,10,10,0.12)",
  },
  IN_PROCESS: {
    label: "Em Processo",
    bg: "rgba(245,158,11,0.10)",
    color: "#78450c",
    border: "rgba(180,100,10,0.20)",
  },
  INTERVIEW: {
    label: "Entrevista",
    bg: "rgba(245,158,11,0.13)",
    color: "#78450c",
    border: "rgba(180,100,10,0.22)",
  },
  ASSESSMENT: {
    label: "Avaliação",
    bg: "rgba(245,158,11,0.10)",
    color: "#78450c",
    border: "rgba(180,100,10,0.20)",
  },
  OFFER: {
    label: "Proposta",
    bg: "rgba(16,185,129,0.10)",
    color: "#065f46",
    border: "rgba(16,185,129,0.22)",
  },
  HIRED: {
    label: "Contratado",
    bg: "rgba(198,255,58,0.18)",
    color: "#2a5a08",
    border: "rgba(110,150,20,0.25)",
  },
  REJECTED: {
    label: "Rejeitada",
    bg: "rgba(10,10,10,0.04)",
    color: "#8a8a85",
    border: "transparent",
  },
  WITHDRAWN: {
    label: "Desistência",
    bg: "rgba(10,10,10,0.04)",
    color: "#8a8a85",
    border: "transparent",
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

export function getStatusConfig(status: string): StatusConfig {
  return (
    STATUS_CONFIG[status as JobApplicationStatus] ?? {
      label: status,
      bg: "rgba(10,10,10,0.05)",
      color: "#6a6560",
      border: "transparent",
    }
  );
}
