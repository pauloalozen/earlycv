// Elementos visuais institucionais compartilhados dos e-mails de Product
// Updates — extraídos como funções puras a partir da mesma paleta/tipografia
// já validada em monitor-digest-email.service.ts (Geist 300/700 pro
// wordmark, preto #0a0a0a, bg card #fafaf6, texto secundário #6a6560/#8a8a85).
// Deliberadamente um arquivo NOVO, não uma refatoração do
// MonitorDigestEmailService (que permanece intocado) — ver AGENTS.md sobre
// isolamento de domínios.

const GEIST = "'Geist', -apple-system, system-ui, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Ícone já existente em apps/web/public (mesmo mark usado no favicon do
// Monitor) — evita depender de um asset separado só pra este e-mail.
export function buildProductUpdateLogoUrl(): string {
  const base = process.env.FRONTEND_URL ?? "http://localhost:3000";
  return `${base}/favicon-192x192.png`;
}

export function renderEmailHeader(): string {
  return `
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;700&display=swap" />
    <table role="presentation" style="margin-bottom:20px;">
      <tr>
        <td style="vertical-align:middle;padding-right:8px;">
          <img src="${buildProductUpdateLogoUrl()}" width="24" height="24" alt="earlyCV" style="display:block;border:0;border-radius:6px;" />
        </td>
        <td style="vertical-align:middle;font-size:14px;letter-spacing:-0.01em;">
          <span style="font-family:${GEIST};font-weight:300;">early</span><span style="font-family:${GEIST};font-weight:700;">CV</span>
        </td>
      </tr>
    </table>`;
}

// unsubscribePlaceholder é {{amazonSESUnsubscribeUrl}} em produção (o SES
// resolve o link de fato via ListManagementOptions no SendEmailCommand) —
// nunca uma URL/token nossos. Em envio de teste (sem ListManagementOptions),
// o placeholder é substituído por um texto informativo (ver
// ProductUpdateEmailService.sendTest), já que o SES não resolveria o
// placeholder nesse caminho.
export function renderEmailFooter(input: {
  footerText?: string;
  unsubscribeHtml: string;
}): string {
  return `
    ${
      input.footerText
        ? `<p style="color:#6a6560;font-size:12px;margin:24px 0 8px;">${escapeHtml(input.footerText)}</p>`
        : ""
    }
    <p style="color:#8a8a85;font-size:11px;margin-top:16px;">
      Você está recebendo isso porque é usuário EarlyCV. ${input.unsubscribeHtml}
    </p>`;
}

export function renderPrimaryButton(input: {
  text: string;
  url: string;
}): string {
  return `
    <p style="margin:24px 0;">
      <a href="${input.url}" style="background:#0a0a0a;color:#fafaf6;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600;display:inline-block;">${escapeHtml(input.text)}</a>
    </p>`;
}

export function renderEmailShell(input: { bodyHtml: string }): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
      ${renderEmailHeader()}
      ${input.bodyHtml}
    </div>`;
}
