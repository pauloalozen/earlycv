"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MOCK_INTERVIEW_OFFER as OFFER } from "@/lib/mock-interview-offer";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

export type ActiveMockInterview = { id: string; code: string } | null;

export function mockInterviewCheckoutHref(applicationId: string) {
  return `${OFFER.checkoutPath}?origem=candidatura&candidatura=${encodeURIComponent(applicationId)}`;
}

function landingHref(applicationId: string) {
  return `${OFFER.path}?origem=candidatura&candidatura=${encodeURIComponent(applicationId)}`;
}

const BULLETS = [
  `${OFFER.durationMinutes} min ao vivo pelo Google Meet`,
  "Perguntas baseadas nesta vaga",
  "Relatório formal com recomendações",
] as const;

// Card fixo no detalhe da candidatura enquanto ela está em "Entrevista".
export function MockInterviewOfferCard({
  applicationId,
  active,
  priceLabel = null,
}: {
  applicationId: string;
  active: ActiveMockInterview;
  // Preço vigente (API). null = não exibe o valor.
  priceLabel?: string | null;
}) {
  if (active) {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "#fafaf6",
          border: "1px solid rgba(10,10,10,0.08)",
          borderRadius: 14,
          padding: "16px 20px",
          fontFamily: GEIST,
        }}
      >
        <span style={{ fontSize: 14, color: "#2a2620" }}>
          Você já tem uma entrevista simulada (pedido #{active.code}).
        </span>
        <Link
          href={`/simulacao-de-entrevista/pedido/${active.id}`}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#0a0a0a",
            textDecoration: "underline",
            textDecorationColor: "rgba(10,10,10,0.25)",
            textUnderlineOffset: 4,
          }}
        >
          Ver pedido
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "14px 24px",
        background: "#0a0a0a",
        color: "#fafaf6",
        borderRadius: 14,
        padding: "20px 22px",
        fontFamily: GEIST,
        boxShadow: "0 24px 60px -24px rgba(10,10,10,0.45)",
      }}
      className="mi-offer-card"
    >
      <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#9a9890",
            textTransform: "uppercase",
          }}
        >
          Entrevista simulada · ao vivo
        </span>
        <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.4 }}>
          Treine com quem está há 20 anos em TI{" "}
          <em style={{ fontFamily: SERIF_ITALIC, fontWeight: 400 }}>
            antes do dia.
          </em>
        </span>
        <span style={{ fontSize: 13, color: "#b9b8b0" }}>
          {BULLETS.join(" · ")}
        </span>
      </div>
      <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
        {priceLabel && (
          <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.6 }}>
            {priceLabel}
          </span>
        )}
        <Link
          href={mockInterviewCheckoutHref(applicationId)}
          style={{
            background: "#c6ff3a",
            color: "#0a0a0a",
            borderRadius: 9,
            padding: "10px 16px",
            fontSize: 13.5,
            fontWeight: 500,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Quero treinar →
        </Link>
        <Link
          href={landingHref(applicationId)}
          style={{ fontSize: 12, color: "#9a9890" }}
        >
          Como funciona
        </Link>
      </div>
      <style>{`
        @media (max-width: 560px) {
          .mi-offer-card { grid-template-columns: minmax(0, 1fr) !important; }
          .mi-offer-card > div:last-child { justify-items: start !important; }
        }
      `}</style>
    </div>
  );
}

const SEEN_KEY_PREFIX = "earlycv:mock-interview-offer-seen:";

// Mostrado uma vez por candidatura (por navegador) logo depois que a pessoa
// registra a entrevista. Nunca aparece para quem já tem uma sessão ativa.
export function shouldShowMockInterviewOfferModal(applicationId: string) {
  try {
    return (
      window.localStorage.getItem(SEEN_KEY_PREFIX + applicationId) === null
    );
  } catch {
    return true;
  }
}

function markSeen(applicationId: string) {
  try {
    window.localStorage.setItem(SEEN_KEY_PREFIX + applicationId, "1");
  } catch {
    // armazenamento bloqueado: no pior caso o modal reaparece
  }
}

export function MockInterviewOfferModal({
  applicationId,
  onClose,
  priceLabel = null,
}: {
  applicationId: string;
  onClose: () => void;
  priceLabel?: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    markSeen(applicationId);
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, [applicationId]);

  function close() {
    setVisible(false);
    setTimeout(onClose, 190);
  }

  return (
    <div
      aria-labelledby="mi-offer-title"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(10,10,10,0.42)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms ease",
        fontFamily: GEIST,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#fafaf6",
          borderRadius: 18,
          padding: "28px 26px 24px",
          display: "grid",
          gap: 16,
          transform: visible ? "none" : "translateY(-10px)",
          transition: "transform 180ms ease",
          boxShadow: "0 30px 80px -20px rgba(10,10,10,0.45)",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#8a8a85",
            textTransform: "uppercase",
          }}
        >
          Entrevista registrada
        </span>
        <h2
          id="mi-offer-title"
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: -0.8,
            lineHeight: 1.15,
          }}
        >
          Quer chegar nela{" "}
          <em style={{ fontFamily: SERIF_ITALIC, fontWeight: 400 }}>
            já treinado?
          </em>
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "#45443e",
          }}
        >
          Faço uma entrevista simulada com você, com perguntas baseadas nesta
          vaga, feedback na hora e um relatório formal com as minhas
          recomendações depois da sessão.
        </p>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 6,
            fontSize: 14,
            color: "#2a2620",
          }}
        >
          {BULLETS.map((item) => (
            <li key={item}>
              <span aria-hidden="true" style={{ color: "#405410" }}>
                ✓
              </span>{" "}
              {item}
            </li>
          ))}
        </ul>
        {priceLabel && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              borderTop: "1px solid rgba(10,10,10,0.08)",
              paddingTop: 14,
            }}
          >
            <span
              style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8 }}
            >
              {priceLabel}
            </span>
            <span style={{ fontSize: 12.5, color: "#6a6560" }}>
              {OFFER.offerLabel}
            </span>
          </div>
        )}
        <Link
          href={mockInterviewCheckoutHref(applicationId)}
          style={{
            background: "#0a0a0a",
            color: "#fafaf6",
            borderRadius: 10,
            padding: "13px 18px",
            fontSize: 14,
            fontWeight: 500,
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          Quero minha entrevista simulada →
        </Link>
        <button
          onClick={close}
          style={{
            background: "transparent",
            border: 0,
            color: "#6a6560",
            fontSize: 13.5,
            cursor: "pointer",
            padding: 4,
          }}
          type="button"
        >
          Agora não
        </button>
      </div>
    </div>
  );
}
