import { Injectable } from "@nestjs/common";

import {
  escapeHtml,
  renderEmailFooter,
  renderEmailShell,
  renderPrimaryButton,
} from "./product-update-email-layout";

// Placeholder resolvido pelo próprio SES (ListManagementOptions no
// SendEmailCommand) — nunca uma URL/token nossos. Só usado no modo "real";
// no modo "test" não faz sentido (envio de teste não passa
// ListManagementOptions, ver ProductUpdateEmailService.sendTest), então o
// rodapé de teste usa um texto informativo fixo no lugar.
const SES_UNSUBSCRIBE_PLACEHOLDER = "{{amazonSESUnsubscribeUrl}}";

export type ProductUpdateContentInput = {
  subject: string;
  preheader?: string | null;
  content: string;
  primaryButtonText?: string | null;
  primaryButtonUrl?: string | null;
  optionalFooterContent?: string | null;
};

export type RenderedProductUpdateEmail = {
  html: string;
  text: string;
};

// Renderiza o conteúdo estruturado fornecido pelo admin (nunca HTML
// arbitrário) em HTML responsivo + texto puro — a MESMA função é usada por
// preview, envio de teste e envio real, nunca implementações divergentes.
@Injectable()
export class ProductUpdateTemplateService {
  render(
    input: ProductUpdateContentInput,
    options: {
      recipientName?: string | null;
      mode: "real" | "test";
    },
  ): RenderedProductUpdateEmail {
    const greeting = options.recipientName
      ? `Olá, ${firstName(options.recipientName)},`
      : "Olá,";

    const paragraphs = splitParagraphs(input.content);

    const unsubscribeHtml =
      options.mode === "real"
        ? `<a href="${SES_UNSUBSCRIBE_PLACEHOLDER}" style="color:#8a8a85;">Cancelar comunicados institucionais</a>.`
        : `<span>Link de descadastro real do SES (omitido em envios de teste).</span>`;

    const bodyHtml = `
      ${
        input.preheader
          ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>`
          : ""
      }
      <p style="font-size:14px;color:#3a3a36;margin:0 0 12px;">${escapeHtml(greeting)}</p>
      <h1 style="font-size:19px;font-weight:600;margin:0 0 16px;">${escapeHtml(input.subject)}</h1>
      ${paragraphs
        .map(
          (paragraph) =>
            `<p style="font-size:14px;color:#3a3a36;margin:0 0 14px;line-height:1.5;">${escapeHtml(paragraph)}</p>`,
        )
        .join("")}
      ${
        input.primaryButtonText && input.primaryButtonUrl
          ? renderPrimaryButton({
              text: input.primaryButtonText,
              url: input.primaryButtonUrl,
            })
          : ""
      }
      ${renderEmailFooter({
        footerText: input.optionalFooterContent ?? undefined,
        unsubscribeHtml,
      })}`;

    const html = renderEmailShell({ bodyHtml });

    const text = [
      greeting,
      "",
      input.subject,
      "",
      ...paragraphs,
      ...(input.primaryButtonText && input.primaryButtonUrl
        ? ["", `${input.primaryButtonText}: ${input.primaryButtonUrl}`]
        : []),
      ...(input.optionalFooterContent ? ["", input.optionalFooterContent] : []),
      "",
      "Você está recebendo isso porque é usuário EarlyCV.",
      options.mode === "real"
        ? `Cancelar comunicados institucionais: ${SES_UNSUBSCRIBE_PLACEHOLDER}`
        : "Link de descadastro real do SES (omitido em envios de teste).",
    ].join("\n");

    return { html, text };
  }
}

function splitParagraphs(content: string): string[] {
  // O textarea do admin envia o conteúdo via submit de <form> nativo —
  // multipart/form-data normaliza toda quebra de linha pra CRLF (\r\n) por
  // especificação (RFC 7578/HTML forms), mesmo que o usuário só tenha
  // digitado \n. Sem este replace, "\n\n" vira "\r\n\r\n" no banco e o
  // regex abaixo (que só reconhece \n puro) nunca separa parágrafo nenhum
  // — bug real visto em produção: conteúdo com linhas em branco chegava
  // tudo junto num parágrafo só no e-mail.
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}
