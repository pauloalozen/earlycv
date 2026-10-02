"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MOCK_INTERVIEW_OFFER as OFFER } from "@/lib/mock-interview-offer";
import type { MockInterviewCheckoutOrigin } from "@/lib/mock-interviews-types";
import {
  card,
  label,
  MONO,
  primaryButton,
  SERIF,
} from "../_components/flow-styles";

const INCLUDED = [
  `${OFFER.durationMinutes} minutos ao vivo pelo Google Meet`,
  "Perguntas baseadas na vaga que você vai disputar",
  "Feedback durante e no final da sessão",
  "Relatório formal com as minhas recomendações",
] as const;

export function CheckoutPanel({
  origin,
  jobApplicationId,
  application,
  priceLabel,
}: {
  origin: MockInterviewCheckoutOrigin;
  jobApplicationId: string | null;
  application: { jobTitle: string; companyName: string } | null;
  // null = preço não configurado na API: venda fechada.
  priceLabel: string | null;
}) {
  const unavailable = priceLabel === null;
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function goToPayment() {
    if (!accepted || loading || unavailable) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mock-interviews/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acceptPolicy: true,
          origin,
          ...(jobApplicationId ? { jobApplicationId } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        checkoutPath?: string;
        message?: string;
      };
      if (!response.ok || !data.checkoutPath) {
        throw new Error(
          data.message ??
            "Não foi possível abrir o pagamento agora. Tente de novo em instantes.",
        );
      }
      router.push(data.checkoutPath);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível abrir o pagamento agora.",
      );
      setLoading(false);
    }
  }

  return (
    <div style={{ ...card, padding: "32px 28px", display: "grid", gap: 22 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span style={label}>ENTREVISTA SIMULADA · ENSAIO GERAL</span>
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(28px, 4vw, 36px)",
            fontWeight: 400,
            letterSpacing: -1.2,
            lineHeight: 1.1,
          }}
        >
          Falta pouco para o{" "}
          <em style={{ fontFamily: SERIF, fontWeight: 400 }}>seu treino.</em>
        </h1>
        {application && (
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              color: "#5c5a52",
              fontWeight: 300,
            }}
          >
            Para a entrevista de {application.jobTitle}
            {application.companyName ? ` na ${application.companyName}` : ""}.
          </p>
        )}
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: 8,
          fontSize: 15,
          fontWeight: 300,
          color: "#3a3a38",
        }}
      >
        {INCLUDED.map((item) => (
          <li key={item} style={{ display: "flex", gap: 10 }}>
            <span aria-hidden="true" style={{ color: "#405410" }}>
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          borderTop: "1px solid rgba(10,10,10,0.08)",
          paddingTop: 18,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <span
            style={{
              justifySelf: "start",
              background: "rgba(198,255,58,0.28)",
              color: "#405410",
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            {OFFER.offerLabel}
          </span>
          <span
            style={{
              fontSize: 36,
              fontWeight: 500,
              letterSpacing: -1.2,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {priceLabel ?? "Indisponível"}
          </span>
        </div>
        <span style={{ fontSize: 13, color: "#6a6a66" }}>
          Pix ou cartão, pelo Mercado Pago
        </span>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.08)",
          borderRadius: 12,
          padding: "16px 18px",
          display: "grid",
          gap: 10,
          fontSize: 14,
          color: "#3a3a38",
          fontWeight: 300,
        }}
      >
        <strong style={{ fontWeight: 500, color: "#0a0a0a" }}>
          Regras da sessão
        </strong>
        <span>
          Reembolso integral até {OFFER.refundHoursBefore} horas antes do
          horário agendado (ou a qualquer momento antes de agendar).
        </span>
        <span>
          Remarcação com pelo menos {OFFER.rescheduleHoursBefore} horas de
          antecedência, direto no WhatsApp.
        </span>
        <span>
          Se você não comparecer no horário combinado, a sessão conta como
          realizada e o valor não é devolvido.
        </span>
        <label
          htmlFor="mi-accept-policy"
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            marginTop: 4,
            color: "#0a0a0a",
            fontWeight: 400,
            cursor: "pointer",
          }}
        >
          <input
            checked={accepted}
            id="mi-accept-policy"
            onChange={(event) => setAccepted(event.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16 }}
            type="checkbox"
          />
          Li e aceito as regras de reembolso, remarcação e ausência.
        </label>
      </div>

      {unavailable && (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 14,
            color: "#7a5200",
            background: "#fff7e6",
            border: "1px solid #f0d9a8",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          A venda está indisponível no momento. Tente de novo mais tarde.
        </p>
      )}

      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 14,
            color: "#991b1b",
            background: "#fee2e2",
            borderRadius: 10,
            padding: "10px 14px",
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        <button
          disabled={!accepted || loading || unavailable}
          onClick={goToPayment}
          style={{
            ...primaryButton,
            width: "100%",
            opacity: !accepted || loading || unavailable ? 0.45 : 1,
            cursor:
              !accepted || loading || unavailable ? "not-allowed" : "pointer",
          }}
          type="button"
        >
          {loading ? "Abrindo o pagamento..." : "Ir para o pagamento →"}
        </button>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#8a8a85",
            textAlign: "center",
          }}
        >
          Depois do pagamento, o botão do WhatsApp aparece para combinarmos o
          horário.{" "}
          <Link href={OFFER.path} style={{ color: "#6a6a66" }}>
            Ver detalhes da entrevista simulada
          </Link>
        </p>
      </div>
    </div>
  );
}
