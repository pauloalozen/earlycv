import Link from "next/link";
import type { MockInterviewPurchaseView } from "@/lib/mock-interviews-types";

const MONO = "var(--font-geist-mono), monospace";

const SESSION_LABELS: Record<
  MockInterviewPurchaseView["sessionStatus"],
  string
> = {
  AWAITING_SCHEDULING: "Combinar horário",
  SCHEDULED: "Agendada",
  COMPLETED: "Realizada",
  NO_SHOW: "Não compareceu",
  CANCELLED: "Cancelada",
  REFUNDED: "Estornada",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(cents / 100);
}

export function MockInterviewPurchases({
  items,
}: {
  items: MockInterviewPurchaseView[];
}) {
  return (
    <section
      aria-label="Entrevistas simuladas"
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        <p
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
            margin: "0 0 3px",
          }}
        >
          ENTREVISTAS SIMULADAS
        </p>
        <p style={{ fontSize: 12.5, color: "#8a8a85", margin: 0 }}>
          Sessões ao vivo pelo Google Meet, com relatório depois.
        </p>
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 20px",
              borderTop: "1px solid rgba(10,10,10,0.05)",
            }}
          >
            <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Entrevista simulada · #{item.code}
              </span>
              <span style={{ fontSize: 12.5, color: "#8a8a85" }}>
                {item.paymentStatus === "refunded"
                  ? "Estornada"
                  : item.scheduledAt && item.sessionStatus === "SCHEDULED"
                    ? `Agendada para ${formatDate(item.scheduledAt)}`
                    : SESSION_LABELS[item.sessionStatus]}{" "}
                · {formatMoney(item.amountInCents, item.currency)}
              </span>
            </div>
            <Link
              href={`/simulacao-de-entrevista/pedido/${item.id}`}
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
          </li>
        ))}
      </ul>
    </section>
  );
}
