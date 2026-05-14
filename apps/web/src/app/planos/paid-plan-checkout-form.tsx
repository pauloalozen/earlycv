"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties, type FormEvent } from "react";

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

  const normalizedPrice = useMemo(() => {
    return Number.isFinite(planPrice) ? planPrice.toFixed(2) : "";
  }, [planPrice]);

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

      const payload = (await response.json()) as Partial<{
        purchaseId: string;
        checkoutUrl: string;
        checkoutMode: string;
      }>;
      if (!payload.purchaseId) {
        throw new Error("invalid-checkout-payload");
      }

      if (payload.checkoutMode === "brick") {
        router.push(`/pagamento/checkout/${payload.purchaseId}`);
      } else if (payload.checkoutUrl) {
        const pendingUrl = new URL("/pagamento/pendente", window.location.origin);
        pendingUrl.searchParams.set("checkoutId", payload.purchaseId);

        try {
          const checkoutUrl = new URL(payload.checkoutUrl);
          const preferenceId = checkoutUrl.searchParams.get("preference_id");
          if (preferenceId) {
            pendingUrl.searchParams.set("preference_id", preferenceId);
          }
        } catch {
          // ignore malformed checkoutUrl and continue with pending route
        }

        window.open(payload.checkoutUrl, "_blank", "noopener,noreferrer");
        router.push(`${pendingUrl.pathname}?${pendingUrl.searchParams.toString()}`);
      } else {
        throw new Error("invalid-checkout-payload");
      }
    } catch {
      setError("Erro ao iniciar pagamento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
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

      {error ? (
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
