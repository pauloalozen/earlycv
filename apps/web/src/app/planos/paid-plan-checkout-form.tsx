"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

type PaidPlanCheckoutFormProps = {
  adaptationId?: string;
  buttonClassName: string;
  buttonStyle: CSSProperties;
  cta: string;
  credits: number | null;
  planId: "starter" | "pro" | "turbo";
  planLabel: string;
  planPrice: number;
};

type CheckoutDraft = {
  checkoutUrl: string;
  purchaseId: string;
};

export function PaidPlanCheckoutForm({
  adaptationId,
  buttonClassName,
  buttonStyle,
  cta,
  credits,
  planId,
  planLabel,
  planPrice,
}: PaidPlanCheckoutFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const descriptionId = `checkout-confirm-description-${planId}`;
  const titleId = `checkout-confirm-title-${planId}`;

  const normalizedPrice = useMemo(() => {
    return Number.isFinite(planPrice) ? planPrice.toFixed(2) : "";
  }, [planPrice]);

  useEffect(() => {
    if (checkoutDraft) {
      confirmButtonRef.current?.focus();
    }
  }, [checkoutDraft]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/plans/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adaptationId, planId }),
      });

      if (!response.ok) {
        throw new Error("checkout-failed");
      }

      const payload = (await response.json()) as Partial<CheckoutDraft>;
      if (!payload.checkoutUrl || !payload.purchaseId) {
        throw new Error("invalid-checkout-payload");
      }

      setCheckoutDraft({
        checkoutUrl: payload.checkoutUrl,
        purchaseId: payload.purchaseId,
      });
    } catch {
      setError("Erro ao iniciar pagamento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleConfirmCheckout() {
    if (!checkoutDraft || isConfirming) {
      return;
    }

    setError(null);
    setIsConfirming(true);

    window.open(
      checkoutDraft.checkoutUrl,
      "_blank",
      "noopener,noreferrer",
    );

    router.push(`/pagamento/pendente?checkoutId=${checkoutDraft.purchaseId}`);
  }

  return (
    <>
      <form action="/plans/checkout" method="post" onSubmit={handleSubmit}>
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="planName" value={planLabel} />
        <input type="hidden" name="planCredits" value={credits ?? ""} />
        <input type="hidden" name="planPrice" value={normalizedPrice} />
        <input type="hidden" name="planCurrency" value="BRL" />
        <input type="hidden" name="sourceDetail" value="planos_card_cta" />
        {adaptationId && (
          <input type="hidden" name="adaptationId" value={adaptationId} />
        )}
        <button
          type="submit"
          style={buttonStyle}
          className={buttonClassName}
          disabled={isLoading}
        >
          {isLoading ? "Carregando..." : cta}
        </button>
      </form>

      {checkoutDraft ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,10,10,0.35)",
            padding: "0 16px",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div>
                <p
                  id={titleId}
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    margin: "0 0 4px",
                  }}
                >
                  Confirmar pagamento
                </p>
                <div id={descriptionId}>
                  <p
                    style={{
                      margin: "0 0 8px",
                      color: "#6a6560",
                      fontSize: 13.5,
                      lineHeight: 1.45,
                    }}
                  >
                    Voce sera redirecionado para o Mercado Pago para concluir o
                    pagamento.
                  </p>
                  <p
                    style={{
                      margin: "0 0 8px",
                      color: "#6a6560",
                      fontSize: 13.5,
                      lineHeight: 1.45,
                    }}
                  >
                    Apos pagar, volte ao EarlyCV para aguardar a efetivacao.
                  </p>
                  <p
                    style={{
                      margin: 0,
                      color: "#6a6560",
                      fontSize: 13.5,
                      lineHeight: 1.45,
                    }}
                  >
                    Pagamentos por PIX podem levar alguns minutos para confirmar.
                  </p>
                </div>
              </div>
            </div>

            {error ? (
              <p
                role="alert"
                aria-live="assertive"
                style={{
                  margin: "0 0 14px",
                  borderRadius: 8,
                  padding: "8px 10px",
                  background: "#fee2e2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: 13,
                }}
              >
                {error}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={handleConfirmCheckout}
                disabled={isConfirming}
                style={{
                  border: "none",
                  borderRadius: 8,
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  padding: "10px 12px",
                  fontWeight: 600,
                  fontSize: 13.5,
                  cursor: isConfirming ? "default" : "pointer",
                  opacity: isConfirming ? 0.7 : 1,
                }}
              >
                {isConfirming
                  ? "Abrindo Mercado Pago..."
                  : "Continuar para Mercado Pago"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {error && !checkoutDraft ?
        (
          <p
            role="alert"
            aria-live="assertive"
            style={{
              margin: "10px 0 14px",
              fontSize: 12,
              color: "#991b1b",
            }}
          >
            {error}
          </p>
        ) : null}
    </>
  );
}
