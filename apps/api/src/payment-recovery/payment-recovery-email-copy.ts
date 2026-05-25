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
  return "Preparamos sua adaptacao para aumentar suas chances nessa vaga.";
}

export function buildPaymentRecoveryEmailCopy(
  input: CopyInput,
): PaymentRecoveryEmailCopy {
  const safeFirstName = input.firstName?.trim() || "tudo bem";
  const safeJobTitle = input.jobTitle?.trim() || "esta vaga";
  const subject = `Retome sua adaptacao para ${safeJobTitle}`;
  const preheader = "Seu CV adaptado esta pronto para continuar.";
  const scoreSentence = resolveScoreSentence(input);
  const text = [
    `Oi ${safeFirstName},`,
    "",
    `Seu pagamento ficou pendente e a adaptacao de CV para ${safeJobTitle} ainda pode ser liberada.`,
    scoreSentence,
    "",
    `Retomar agora: ${input.recoveryLink}`,
  ].join("\n");
  const html = [
    "<!doctype html>",
    '<html lang="pt-BR">',
    '<body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,sans-serif;color:#111;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f6f6;padding:24px 12px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e9e9e9;border-radius:10px;padding:24px;">',
    `<tr><td style="font-size:16px;line-height:1.6;">Oi ${safeFirstName},</td></tr>`,
    '<tr><td style="height:12px;line-height:12px;font-size:12px;">&nbsp;</td></tr>',
    `<tr><td style="font-size:15px;line-height:1.6;">Seu pagamento da adaptacao de CV para <strong>${safeJobTitle}</strong> esta pendente.</td></tr>`,
    `<tr><td style="font-size:15px;line-height:1.6;">${scoreSentence}</td></tr>`,
    '<tr><td style="height:20px;line-height:20px;font-size:20px;">&nbsp;</td></tr>',
    `<tr><td><a href="${input.recoveryLink}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:600;">Retomar pagamento agora</a></td></tr>`,
    '<tr><td style="height:16px;line-height:16px;font-size:16px;">&nbsp;</td></tr>',
    `<tr><td style="font-size:13px;line-height:1.6;color:#555;">Se o botao nao abrir, copie e cole este link no navegador:<br/><a href="${input.recoveryLink}" style="color:#111;">${input.recoveryLink}</a></td></tr>`,
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("");

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
