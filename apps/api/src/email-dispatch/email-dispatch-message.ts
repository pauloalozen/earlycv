import type { EmailDispatchKind } from "@prisma/client";

import type { EmailMessage } from "../email/email.types";
import type { RenderedEmail } from "./email-dispatch-templates";

// Única fonte da MENSAGEM enviada (worker e teste explícito sem banco usam
// as mesmas funções — nunca duas montagens que possam divergir). From/
// Reply-To/Configuration Set NÃO entram aqui: a fachada os injeta pelo perfil
// da categoria (EmailRoutingPolicy).

// Relacionamento (categoria RELATIONSHIP, SES): tópico PRÓPRIO da contact
// list — é a barreira de descadastro e o que faz o SES injetar o link no
// placeholder e o header List-Unsubscribe. Tags voltam em todo evento do
// webhook e é por elas que o EMAIL_DISPATCH é roteado/correlacionado.
export function buildRelationshipMessage(input: {
  dispatchId: string;
  kind: EmailDispatchKind;
  to: string;
  rendered: RenderedEmail;
  contactListName: string;
  topicName: string;
}): EmailMessage {
  return {
    to: input.to,
    subject: input.rendered.subject,
    text: input.rendered.text,
    html: input.rendered.html,
    listManagementOptions: {
      contactListName: input.contactListName,
      topicName: input.topicName,
    },
    // SES v2 ignora (sem equivalente nativo); a correlação real é pelas tags.
    idempotencyKey: `email-dispatch:${input.dispatchId}`,
    tags: {
      correlationType: "EMAIL_DISPATCH",
      correlationId: input.dispatchId,
      kind: input.kind,
    },
  };
}

// Confirmação de compra (categoria BILLING, Resend): transacional — SEM
// listManagementOptions, SEM descadastro.
export function buildBillingMessage(input: {
  dispatchId: string;
  to: string;
  rendered: RenderedEmail;
}): EmailMessage {
  return {
    to: input.to,
    subject: input.rendered.subject,
    text: input.rendered.text,
    html: input.rendered.html,
    idempotencyKey: `email-dispatch:${input.dispatchId}`,
  };
}
