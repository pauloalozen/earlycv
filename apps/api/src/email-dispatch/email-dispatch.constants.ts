// Contas NUNCA elegíveis aos envios automáticos de relacionamento (as duas
// do Paulo). Lista fixa no código de propósito — não depende de env estar
// configurada. Env EMAIL_RELATIONSHIP_BLOCKLIST só ACRESCENTA. Testes
// explícitos (EmailDispatchService.sendTest) podem usá-las, com destinatário
// informado.
export const RELATIONSHIP_BLOCKED_EMAILS: readonly string[] = [
  "paulo.alozen@gmail.com",
  "contato@earlycv.com.br",
];

export const HOUR_MS = 60 * 60_000;

// Boas-vindas: pequeno atraso depois da verificação (nunca no mesmo
// instante do e-mail de código) e prazo curto — boas-vindas velha não faz
// sentido, expira em vez de ficar pendente.
export const WELCOME_DELAY_MS = 10 * 60_000;
export const WELCOME_EXPIRY_MS = 48 * HOUR_MS;

// Feedback: 24h após o cadastro, mas nunca a menos de 12h da boas-vindas
// (verificação tardia). Prazo de 48h depois do horário agendado cobre
// adiamento por janela de horário/boas-vindas; passou disso, é descartado.
export const FEEDBACK_DELAY_AFTER_SIGNUP_MS = 24 * HOUR_MS;
export const FEEDBACK_MIN_GAP_AFTER_WELCOME_MS = 12 * HOUR_MS;
export const FEEDBACK_EXPIRY_MS = 48 * HOUR_MS;

// Feedback segunda chamada: 14 dias depois do ENVIO do primeiro feedback
// (a linha só nasce quando o primeiro vira SENT). Mesmo prazo de 48h para
// adiamento por janela de horário.
export const FEEDBACK_SECOND_CALL_DELAY_MS = 14 * 24 * HOUR_MS;

// Janela de envio do feedback, horário de Brasília (UTC-3 fixo — o Brasil
// não tem horário de verão desde 2019).
export const BRASILIA_UTC_OFFSET_MS = 3 * HOUR_MS;
export const FEEDBACK_WINDOW_START_HOUR = 8;
export const FEEDBACK_WINDOW_END_HOUR = 20; // exclusivo

export const MAX_SEND_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = 15 * 60_000;
export const STALE_PROCESSING_THRESHOLD_MS = 10 * 60_000;
export const WORKER_BATCH_SIZE = 10;
