import { randomUUID } from "node:crypto";

import type { EmailSendResult, EmailService } from "../email/email.types";
import type { EmailDispatchConfigService } from "./email-dispatch.config";
import { buildRelationshipMessage } from "./email-dispatch-message";
import {
  renderFeedbackEmail,
  renderWelcomeEmail,
} from "./email-dispatch-templates";

export type StandaloneTestResult =
  | { sent: true; dispatchId: string; result: EmailSendResult }
  | { sent: false; reason: string };

// Envio REAL de teste de relacionamento SEM banco: não grava EmailDispatch,
// não consulta supressão, não abre conexão. Usa exatamente a mesma montagem
// de mensagem do envio automático (buildRelationshipMessage). O
// correlationId vira "manual-<uuid>": os eventos do SES (Delivery, Subscription...)
// voltam pelo webhook de produção, que os registra com dispatchId nulo (não há
// linha para correlacionar) e aplica o descadastro de verdade pelo e-mail do
// contato. Só relacionamento (welcome/feedback/feedback2) — confirmação de compra sai
// pelo Resend e exige o fluxo com banco.
export async function sendRelationshipTestWithoutDb(input: {
  kind: "WELCOME" | "FEEDBACK_FIRST_USE" | "FEEDBACK_SECOND_CALL";
  to: string;
  name: string | null;
  appUrl: string;
  config: Pick<EmailDispatchConfigService, "checkSendReadiness">;
  emailService: Pick<EmailService, "send">;
}): Promise<StandaloneTestResult> {
  const readiness = input.config.checkSendReadiness();
  if (!readiness.ready) {
    return { sent: false, reason: `not_ready:${readiness.reason}` };
  }

  const dispatchId = `manual-${randomUUID()}`;
  const rendered =
    input.kind === "WELCOME"
      ? renderWelcomeEmail({ name: input.name, appUrl: input.appUrl })
      : renderFeedbackEmail({ name: input.name, kind: input.kind });

  const result = await input.emailService.send({
    category: "RELATIONSHIP",
    message: buildRelationshipMessage({
      dispatchId,
      kind: input.kind,
      to: input.to,
      rendered,
      contactListName: readiness.contactListName,
      topicName: readiness.topicName,
    }),
  });

  return { sent: true, dispatchId, result };
}
