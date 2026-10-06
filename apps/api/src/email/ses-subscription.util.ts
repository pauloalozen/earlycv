// Evento "Subscription" do SES List Management — compartilhado entre os
// tópicos (Product Updates e Relacionamento vivem na MESMA contact list e
// recebem o MESMO evento). Cada handler só deve reagir à mudança do SEU
// tópico: sem isso, descadastrar de comunicados poderia (se o payload
// listar todos os tópicos) ser lido como "opt-in" de relacionamento, ou
// vice-versa.
//
// Formato conforme a documentação oficial da AWS ("Examples of event data
// that Amazon SES publishes to Amazon SNS" → Subscription record):
//   - subscription.source NÃO é o e-mail do contato: é o MECANISMO do
//     descadastro (ex.: "UnsubscribeHeader"). O contato está em
//     mail.destination[0].
//   - subscriptionStatus vem como "OptIn"/"OptOut" no evento (a API usa
//     "OPT_IN"/"OPT_OUT") — aceitamos as duas grafias.
// Ainda não confirmado contra um evento REAL da conta (ver runbook).
// Parsing 100% defensivo: formato inesperado resolve para null (ignorado).
export type SesTopicPreferences = {
  unsubscribeAll?: boolean;
  topicSubscriptionStatus?: Array<{
    topicName?: string;
    subscriptionStatus?: string;
  }>;
};

export type SesSubscriptionEventPayload = {
  eventType: "Subscription";
  mail?: { destination?: string[] };
  subscription?: {
    contactList?: string;
    source?: string;
    newTopicPreferences?: SesTopicPreferences;
    oldTopicPreferences?: SesTopicPreferences;
  };
};

// "OptOut" | "OPT_OUT" | "opt-out" -> "OPT_OUT"; qualquer outra coisa ->
// undefined (ignorada).
function normalizeStatus(
  value: string | undefined,
): "OPT_IN" | "OPT_OUT" | undefined {
  const letters = value?.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters === "OPTIN") return "OPT_IN";
  if (letters === "OPTOUT") return "OPT_OUT";
  return undefined;
}

function topicStatus(
  preferences: SesTopicPreferences | undefined,
  topicName: string | undefined,
) {
  if (!topicName) return undefined;
  return normalizeStatus(
    preferences?.topicSubscriptionStatus?.find(
      (entry) => entry.topicName === topicName,
    )?.subscriptionStatus,
  );
}

// E-mail do contato que mudou de preferência: mail.destination[0] (formato
// oficial). Fallback para subscription.source SÓ se ele parecer um e-mail
// (formato antigo assumido pelo código original). null = não dá para
// identificar o contato, evento ignorado.
export function resolveSubscriptionContactEmail(
  payload: SesSubscriptionEventPayload,
): string | null {
  const candidates = [
    payload.mail?.destination?.[0],
    payload.subscription?.source,
  ];
  for (const candidate of candidates) {
    const email = candidate?.trim().toLowerCase();
    if (email?.includes("@")) return email;
  }
  return null;
}

// null = este evento não muda nada para o tópico (outro tópico, ou sem
// mudança relevante). Quando oldTopicPreferences vem no payload, só conta
// se o estado deste tópico (ou o "cancelar tudo") de fato mudou; sem ele,
// cai no comportamento original (reage ao estado novo).
export function resolveTopicSubscriptionChange(
  payload: SesSubscriptionEventPayload,
  topicName: string | undefined,
): "OPT_OUT" | "OPT_IN" | null {
  const next = payload.subscription?.newTopicPreferences;
  const previous = payload.subscription?.oldTopicPreferences;

  const unsubscribedAll = next?.unsubscribeAll === true;
  const status = topicStatus(next, topicName);

  const optedOut = unsubscribedAll || status === "OPT_OUT";
  const optedIn = !unsubscribedAll && status === "OPT_IN";
  if (!optedOut && !optedIn) {
    return null;
  }

  if (previous) {
    const previousAll = previous.unsubscribeAll === true;
    const previousStatus = topicStatus(previous, topicName);
    if (previousAll === unsubscribedAll && previousStatus === status) {
      return null;
    }
  }

  return optedOut ? "OPT_OUT" : "OPT_IN";
}
