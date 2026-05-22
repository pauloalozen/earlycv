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
  templateVariables: Record<string, string | number | null>;
};

function resolveScoreSentence(input: CopyInput): string {
  if (typeof input.scoreBefore === "number" && typeof input.scoreAfter === "number") {
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

  return {
    subject,
    preheader,
    text,
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
