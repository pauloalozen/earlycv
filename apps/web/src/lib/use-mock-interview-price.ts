"use client";

import { useEffect, useState } from "react";
import { formatMockInterviewPrice } from "./mock-interview-offer";

// Preço formatado para componentes de cliente que não recebem o valor do
// servidor. null enquanto carrega ou se o preço não estiver configurado.
export function useMockInterviewPrice(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/mock-interviews/offer")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { amountInCents?: unknown } | null) => {
        if (!cancelled && typeof data?.amountInCents === "number") {
          setLabel(formatMockInterviewPrice(data.amountInCents));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return label;
}
