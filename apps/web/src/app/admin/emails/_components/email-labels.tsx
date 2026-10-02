import { AdminPill } from "@/app/admin/_components/admin-primitives";
import type {
  EmailDispatchKind,
  EmailDispatchMode,
  EmailDispatchStatus,
} from "@/lib/admin-emails-api";

type Tone = "ok" | "danger" | "warn" | "info" | "neutral" | "dark";

export const KIND_LABEL: Record<EmailDispatchKind, string> = {
  WELCOME: "Boas-vindas",
  FEEDBACK_FIRST_USE: "Feedback",
  FEEDBACK_SECOND_CALL: "Feedback segunda chamada",
  PURCHASE_CONFIRMATION: "Confirmação de compra",
  MOCK_INTERVIEW_OFFER: "Oferta da entrevista simulada",
};

export const STATUS_LABEL: Record<EmailDispatchStatus, string> = {
  PENDING: "Aguardando",
  PROCESSING: "Enviando",
  SENT: "Enviado",
  FAILED: "Falhou",
  OUTCOME_UNKNOWN: "Indeterminado",
  SKIPPED: "Descartado",
  CANCELLED: "Cancelado",
};

const STATUS_TONE: Record<EmailDispatchStatus, Tone> = {
  PENDING: "info",
  PROCESSING: "info",
  SENT: "ok",
  FAILED: "danger",
  OUTCOME_UNKNOWN: "warn",
  SKIPPED: "neutral",
  CANCELLED: "neutral",
};

export const MODE_LABEL: Record<EmailDispatchMode, string> = {
  OFF: "Desligado",
  SHADOW: "Sombra (não envia)",
  ALLOWLIST: "Só allowlist",
  LIVE: "Ao vivo",
};

const MODE_TONE: Record<EmailDispatchMode, Tone> = {
  OFF: "neutral",
  SHADOW: "info",
  ALLOWLIST: "warn",
  LIVE: "ok",
};

export const MODE_HELP: Record<EmailDispatchMode, string> = {
  OFF: "Nada é criado nem enviado.",
  SHADOW:
    "Cria e avalia tudo (elegibilidade, template), mas NUNCA envia — serve para medir volume.",
  ALLOWLIST: "Envia só para os endereços da allowlist.",
  LIVE: "Envia para todo elegível a partir do cutoff.",
};

// Motivos de descarte/cancelamento mais comuns, em linguagem do admin. Motivo
// desconhecido aparece como veio (nunca some).
const REASON_LABEL: Record<string, string> = {
  shadow_mode: "Modo sombra (não envia)",
  not_allowlisted: "Fora da allowlist",
  expired: "Expirou sem enviar",
  email_unverified: "E-mail não verificado",
  user_inactive: "Usuário inativo",
  user_not_found: "Usuário não encontrado",
  staff_user: "Usuário interno (staff)",
  blocklisted: "Conta bloqueada",
  before_cutoff: "Anterior ao cutoff",
  relationship_unsubscribed: "Descadastrado de relacionamento",
  suppressed_complaint: "Complaint registrado",
  suppressed_hard_bounce: "Hard bounce registrado",
  purchase_not_completed: "Compra não concluída (estornada?)",
  purchase_not_found: "Compra não encontrada",
  purchase_user_mismatch: "Compra de outro usuário",
  outside_window_past_expiry: "Fora da janela de horário e já expirado",
  welcome_pending_past_expiry: "Boas-vindas pendente e já expirado",
  welcome_too_recent_past_expiry: "Boas-vindas recente e já expirado",
  already_purchased: "Já comprou a entrevista simulada",
  offer_cooldown: "Recebeu oferta nos últimos 7 dias",
  application_not_found: "Candidatura apagada",
  mock_interview_disabled:
    "Entrevista simulada desligada (MOCK_INTERVIEW_MODE)",
};

export function reasonLabel(reason: string | null): string {
  if (!reason) return "—";
  return REASON_LABEL[reason] ?? reason;
}

// Motivos de "infra não pronta" devolvidos pela API (nunca nomes de recursos).
const READINESS_LABEL: Record<string, string> = {
  ses_disabled: "SES desligado (SES_EMAIL_ENABLED)",
  ses_credentials_incomplete: "Credenciais do SES incompletas",
  list_management_not_configured:
    "Contact list/tópico de relacionamento não configurados",
  relationship_topic_equals_product:
    "Tópico de relacionamento igual ao de Product Updates",
  sender_profile_incomplete: "Remetente de relacionamento incompleto",
  relationship_config_set_is_shared_tracking_set:
    "Configuration Set de relacionamento igual ao compartilhado (com tracking)",
  resend_not_configured: "RESEND_API_KEY ausente",
};

export function readinessLabel(reason: string): string {
  return READINESS_LABEL[reason] ?? reason;
}

export function StatusPill({ status }: { status: EmailDispatchStatus }) {
  return (
    <AdminPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</AdminPill>
  );
}

export function ModePill({ mode }: { mode: EmailDispatchMode }) {
  return <AdminPill tone={MODE_TONE[mode]}>{MODE_LABEL[mode]}</AdminPill>;
}

export function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}
