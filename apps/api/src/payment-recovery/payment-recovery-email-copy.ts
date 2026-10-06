type CopyInput = {
  firstName: string | null;
  jobTitle: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  scoreDelta: number | null;
  recoveryLink: string;
};

export type PaymentRecoveryEmailCopy = {
  subject: string;
  preheader: string;
  text: string;
  html: string;
  templateVariables: Record<string, string | number | null>;
};

function resolveScoreSentence(input: CopyInput): string {
  if (
    typeof input.scoreBefore === "number" &&
    typeof input.scoreAfter === "number"
  ) {
    return `Seu score foi de ${input.scoreBefore} para ${input.scoreAfter} nessa vaga.`;
  }
  if (typeof input.scoreDelta === "number") {
    if (input.scoreDelta >= 0) {
      return `Seu ajuste estimado foi de +${input.scoreDelta} pontos nessa vaga.`;
    }
    return `Seu ajuste estimado foi de ${input.scoreDelta} pontos nessa vaga.`;
  }
  return "Preparamos sua adaptação para aumentar suas chances nessa vaga.";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Mesmo ícone do e-mail do Alerta de Vaga Certa (apps/web/public).
function buildLogoUrl(): string {
  const base = process.env.FRONTEND_URL ?? "https://earlycv.com.br";
  return `${base.replace(/\/$/, "")}/favicon-192x192.png`;
}

export function buildPaymentRecoveryEmailCopy(
  input: CopyInput,
): PaymentRecoveryEmailCopy {
  const safeFirstName = input.firstName?.trim() || "tudo bem";
  const safeJobTitle = input.jobTitle?.trim() || "esta vaga";
  const subject = `Retome sua adaptação para ${safeJobTitle}`;
  const preheader = "Seu CV adaptado está pronto para continuar.";
  const scoreSentence = resolveScoreSentence(input);
  const text = [
    `Oi ${safeFirstName},`,
    "",
    `Seu pagamento ficou pendente e a adaptação de CV para ${safeJobTitle} ainda pode ser liberada.`,
    scoreSentence,
    "",
    `Retomar agora: ${input.recoveryLink}`,
  ].join("\n");

  // Layout no padrão do e-mail do Alerta de Vaga Certa: ícone + wordmark
  // "early" (300) + "CV" (700) em Geist, preto #0a0a0a, card #fafaf6.
  const GEIST = "'Geist', -apple-system, system-ui, sans-serif";
  const link = escapeHtml(input.recoveryLink);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;700&display=swap" />
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px 16px;color:#0a0a0a;">
  <table role="presentation" style="margin-bottom:20px;">
    <tr>
      <td style="vertical-align:middle;padding-right:8px;">
        <img src="${buildLogoUrl()}" width="24" height="24" alt="earlyCV" style="display:block;border:0;border-radius:6px;" />
      </td>
      <td style="vertical-align:middle;font-size:14px;letter-spacing:-0.01em;">
        <span style="font-family:${GEIST};font-weight:300;">early</span><span style="font-family:${GEIST};font-weight:700;">CV</span>
      </td>
    </tr>
  </table>
  <h1 style="font-size:19px;font-weight:600;margin:0 0 16px;">Sua adaptação de CV está esperando por você</h1>
  <p style="color:#3a3a36;font-size:15px;line-height:1.6;margin:0 0 12px;">Oi ${escapeHtml(safeFirstName)},</p>
  <p style="color:#3a3a36;font-size:15px;line-height:1.6;margin:0 0 12px;">Seu pagamento da adaptação de CV para <strong style="color:#0a0a0a;">${escapeHtml(safeJobTitle)}</strong> ficou pendente, mas ela ainda pode ser liberada.</p>
  <div style="background:#fafaf6;border:1px solid rgba(10,10,10,0.08);border-radius:10px;padding:14px 16px;margin:16px 0;font-size:14px;line-height:1.5;color:#0a0a0a;">${escapeHtml(scoreSentence)}</div>
  <p style="margin:24px 0;">
    <a href="${link}" style="background:#0a0a0a;color:#fafaf6;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600;display:inline-block;">Retomar pagamento agora</a>
  </p>
  <p style="color:#6a6560;font-size:12px;line-height:1.6;margin:0;">Se o botão não abrir, copie e cole este link no navegador:<br/><a href="${link}" style="color:#6a6560;word-break:break-all;">${link}</a></p>
  <p style="color:#8a8a85;font-size:11px;margin-top:32px;">Você está recebendo este e-mail porque iniciou um pagamento no EarlyCV que não foi concluído.</p>
</div>
</body>
</html>`;

  return {
    subject,
    preheader,
    text,
    html,
    templateVariables: {
      firstName: safeFirstName,
      jobTitle: safeJobTitle,
      scoreBefore: input.scoreBefore,
      scoreAfter: input.scoreAfter,
      scoreDelta: input.scoreDelta,
      recoveryLink: input.recoveryLink,
      scoreSentence,
    },
  };
}
