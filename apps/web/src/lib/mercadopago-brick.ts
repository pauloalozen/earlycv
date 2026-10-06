// Utilitários do Mercado Pago Payment Brick compartilhados pelos checkouts
// dentro do EarlyCV (planos em /pagamento/checkout e entrevista simulada).

export function extractBrickErrorMessage(error: unknown): string {
  if (!error) return "Erro desconhecido do Payment Brick";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    const maybeCause = (error as { cause?: unknown }).cause;
    if (typeof maybeCause === "string" && maybeCause.trim()) {
      return maybeCause;
    }
  }
  return "Erro desconhecido do Payment Brick";
}

export function resolveBrickSubmitPayload(
  submitPayload: unknown,
  fallbackPayerEmail: string | null,
): unknown {
  if (!submitPayload || typeof submitPayload !== "object") {
    return submitPayload;
  }

  const candidate = submitPayload as {
    formData?: unknown;
    selectedPaymentMethod?: unknown;
  };
  const resolved =
    candidate.formData && typeof candidate.formData === "object"
      ? (candidate.formData as Record<string, unknown>)
      : (submitPayload as Record<string, unknown>);

  const payload: Record<string, unknown> = { ...resolved };

  if (typeof payload.payment_method_id !== "string") {
    if (typeof payload.paymentMethodId === "string") {
      payload.payment_method_id = payload.paymentMethodId;
    } else if (typeof candidate.selectedPaymentMethod === "string") {
      payload.payment_method_id = candidate.selectedPaymentMethod;
    }
  }

  if (payload.issuer_id === undefined && payload.issuerId !== undefined) {
    payload.issuer_id = payload.issuerId;
  }

  if (
    typeof fallbackPayerEmail === "string" &&
    fallbackPayerEmail.trim().length > 0
  ) {
    const payer =
      payload.payer && typeof payload.payer === "object"
        ? ({ ...(payload.payer as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};
    if (typeof payer.email !== "string" || payer.email.trim().length === 0) {
      payer.email = fallbackPayerEmail;
      payload.payer = payer;
    }
  }

  return payload;
}

export function toImageDataUrl(rawBase64: string): string {
  const value = rawBase64.trim();
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}
