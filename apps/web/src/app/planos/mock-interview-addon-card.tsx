import Image from "next/image";
import Link from "next/link";

import {
  formatMockInterviewAmount,
  MOCK_INTERVIEW_OFFER as OFFER,
} from "@/lib/mock-interview-offer";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Entrevista simulada como COMPRA AVULSA na página de planos: fora do grid
// (não é um nível acima do Turbo), com divisor próprio, e o CTA vai direto
// para o checkout.
export function MockInterviewAddonCard({
  amountInCents,
}: {
  amountInCents: number;
}) {
  return (
    <section
      aria-labelledby="planos-avulso-title"
      data-testid="planos-mock-interview-addon"
      style={{ marginBottom: 24 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <span style={dividerLine} />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.4,
            fontWeight: 500,
            color: "#8a8a85",
            whiteSpace: "nowrap",
          }}
        >
          COMPRA AVULSA
        </span>
        <span style={dividerLine} />
      </div>

      <div className="planos-addon">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <Image
            src="/paulo-alozen.jpg"
            alt="Paulo Alozen"
            width={52}
            height={52}
            style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <h2
              id="planos-avulso-title"
              style={{
                fontFamily: GEIST,
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: -0.6,
                lineHeight: 1.2,
                margin: "0 0 8px",
              }}
            >
              Entrevista simulada ao vivo
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "#5a5a55",
                lineHeight: 1.5,
                margin: "0 0 10px",
              }}
            >
              {OFFER.durationMinutes} minutos pelo Google Meet com o Paulo,
              perguntas da vaga que você quer e relatório com o que ajustar.
            </p>
            <p
              style={{
                fontSize: 12,
                color: "#8a8a85",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Não usa créditos e não está incluída nos planos.
            </p>
          </div>
        </div>

        <div className="planos-addon-buy">
          <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: "#6a6560",
                marginRight: 2,
              }}
            >
              R$
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: -1.4,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatMockInterviewAmount(amountInCents)}
            </span>
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: 0.6,
              color: "#8a8a85",
            }}
          >
            pagamento único · por sessão
          </span>
          <Link
            href={OFFER.checkoutPath}
            className="planos-cta-light"
            style={{
              marginTop: 6,
              display: "block",
              textAlign: "center",
              background: "transparent",
              color: "#0a0a0a",
              border: "1px solid rgba(10,10,10,0.8)",
              borderRadius: 10,
              padding: "11px 16px",
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: GEIST,
              whiteSpace: "nowrap",
            }}
          >
            Comprar entrevista simulada
          </Link>
        </div>
      </div>

      <style>{`
        .planos-addon {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 240px;
          gap: 28px;
          align-items: center;
          background: #fafaf6;
          border: 1px dashed rgba(10,10,10,0.22);
          border-radius: 16px;
          padding: 22px 24px;
        }
        .planos-addon-buy { display: grid; gap: 4px; }
        @media (max-width: 768px) {
          .planos-addon { grid-template-columns: 1fr; gap: 18px; }
        }
      `}</style>
    </section>
  );
}

const dividerLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "rgba(10,10,10,0.1)",
};
