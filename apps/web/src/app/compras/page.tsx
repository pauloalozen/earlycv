import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyPlan, listMyPurchases, type PurchaseItem } from "@/lib/plans-api";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Minhas compras | EarlyCV",
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
};

type StatusConfig = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

function getStatusConfig(status: PurchaseItem["status"]): StatusConfig {
  switch (status) {
    case "completed":
      return {
        label: "Pago",
        color: "#2a5a08",
        bg: "rgba(198,255,58,0.15)",
        border: "rgba(110,150,20,0.25)",
      };
    case "pending":
      return {
        label: "Aguardando pagamento",
        color: "#7a5a00",
        bg: "rgba(255,200,0,0.12)",
        border: "rgba(200,150,0,0.25)",
      };
    case "none":
      return {
        label: "Sem pagamento",
        color: "#8a8a85",
        bg: "rgba(10,10,10,0.04)",
        border: "rgba(10,10,10,0.1)",
      };
    case "failed":
      return {
        label: "Falhou",
        color: "#8a1a1a",
        bg: "rgba(220,50,50,0.08)",
        border: "rgba(180,40,40,0.2)",
      };
    case "refunded":
      return {
        label: "Reembolsado",
        color: "#4a4a80",
        bg: "rgba(80,80,200,0.08)",
        border: "rgba(80,80,200,0.2)",
      };
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(cents / 100);
}

export default async function ComprasPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/compras", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  const [purchasesResult, planResult] = await Promise.allSettled([
    listMyPurchases(),
    getMyPlan(),
  ]);

  const purchases: PurchaseItem[] =
    purchasesResult.status === "fulfilled" ? purchasesResult.value : [];
  const fetchError = purchasesResult.status === "rejected";
  const availableCredits =
    planResult.status === "fulfilled"
      ? toHeaderAvailableCredits(planResult.value)
      : "—";

  const completed = purchases.filter((p) => p.status === "completed").length;
  const pending = purchases.filter(
    (p) => p.status === "pending" || p.status === "none",
  ).length;

  return (
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.4,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      <main
        style={{
          fontFamily: GEIST,
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          color: "#0a0a0a",
          position: "relative",
        }}
      >
        <AppHeader userName={user.name} availableCredits={availableCredits} />

        <div
          className="compras-content"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 32px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Header */}
          <div style={{ padding: "8px 0 20px" }}>
            <h1
              style={{
                fontSize: "clamp(28px, 3.5vw, 40px)",
                fontWeight: 500,
                letterSpacing: -1.5,
                margin: "0 0 6px",
                color: "#0a0a0a",
              }}
            >
              Minhas{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                compras.
              </em>
            </h1>
            <p style={{ fontSize: 14, color: "#8a8a85", margin: 0 }}>
              Acompanhe seus pedidos, pagamentos pendentes e pacotes adquiridos.
            </p>
          </div>

          {/* Summary cards */}
          {!fetchError && purchases.length > 0 && (
            <div
              className="compras-summary"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 14,
                marginBottom: 16,
              }}
            >
              {/* Total — dark CTA card */}
              <article
                style={{
                  background: "#0a0a0a",
                  borderRadius: 14,
                  padding: "20px",
                  boxShadow: "0 20px 50px -16px rgba(10,10,10,0.4)",
                }}
              >
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    color: "#7a7a74",
                    fontWeight: 500,
                    margin: "0 0 6px",
                  }}
                >
                  TOTAL DE PEDIDOS
                </p>
                <p
                  style={{
                    fontSize: 32,
                    fontWeight: 500,
                    letterSpacing: -1.2,
                    color: "#c6ff3a",
                    margin: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {purchases.length}
                </p>
              </article>

              {/* Pagos */}
              <article style={{ ...CARD, padding: "20px" }}>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#6a6560",
                    margin: "0 0 6px",
                  }}
                >
                  Pedidos pagos
                </p>
                <p
                  style={{
                    fontSize: 32,
                    fontWeight: 500,
                    letterSpacing: -1.2,
                    color: "#405410",
                    margin: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {completed}
                </p>
              </article>

              {/* Pendentes */}
              <article style={{ ...CARD, padding: "20px" }}>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#6a6560",
                    margin: "0 0 6px",
                  }}
                >
                  Aguardando pagamento
                </p>
                <p
                  style={{
                    fontSize: 32,
                    fontWeight: 500,
                    letterSpacing: -1.2,
                    color: pending > 0 ? "#7a5a00" : "#0a0a0a",
                    margin: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pending}
                </p>
              </article>
            </div>
          )}

          {/* List */}
          <div style={{ ...CARD, overflow: "hidden" }}>
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
                HISTÓRICO DE COMPRAS
              </p>
              <p style={{ fontSize: 12.5, color: "#8a8a85", margin: 0 }}>
                {fetchError
                  ? "Erro ao carregar"
                  : purchases.length === 0
                    ? "Nenhuma compra registrada"
                    : `${purchases.length} pedido${purchases.length !== 1 ? "s" : ""}`}
              </p>
            </div>

            {fetchError ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "48px 24px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#8a1a1a",
                    margin: 0,
                  }}
                >
                  Erro ao carregar compras
                </p>
                <p style={{ fontSize: 13.5, color: "#6a6560", margin: 0 }}>
                  Tente recarregar a página.
                </p>
              </div>
            ) : purchases.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "48px 24px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    margin: 0,
                  }}
                >
                  Nenhuma compra ainda
                </p>
                <p style={{ fontSize: 13.5, color: "#6a6560", margin: 0 }}>
                  Você ainda não realizou nenhuma compra.
                </p>
                <a
                  href="/planos"
                  style={{
                    marginTop: 8,
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    borderRadius: 10,
                    padding: "11px 20px",
                    fontSize: 13.5,
                    fontWeight: 500,
                    textDecoration: "none",
                    letterSpacing: -0.1,
                  }}
                  className="compras-btn-dark"
                >
                  Ver pacotes
                </a>
              </div>
            ) : (
              <div style={{ padding: "10px" }}>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {purchases.map((item) => {
                    const statusCfg = getStatusConfig(item.status);
                    return (
                      <article
                        key={item.id}
                        style={{
                          background: "#fff",
                          border: "1px solid rgba(10,10,10,0.06)",
                          borderRadius: 12,
                          padding: "16px 18px",
                        }}
                      >
                        <div
                          className="compras-row"
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 16,
                            flexWrap: "wrap",
                          }}
                        >
                          {/* Left: plan + date */}
                          <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                            <p
                              style={{
                                fontSize: 14,
                                fontWeight: 500,
                                color: "#0a0a0a",
                                margin: "0 0 4px",
                              }}
                            >
                              Pacote {item.planName ?? item.planType}
                            </p>
                            <p
                              style={{
                                fontFamily: MONO,
                                fontSize: 10.5,
                                color: "#8a8a85",
                                margin: "0 0 8px",
                              }}
                            >
                              {formatDate(item.createdAt)}
                            </p>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  fontFamily: MONO,
                                  color: statusCfg.color,
                                  background: statusCfg.bg,
                                  border: `1px solid ${statusCfg.border}`,
                                }}
                              >
                                {statusCfg.label}
                              </span>
                              {item.creditsGranted > 0 && (
                                <span
                                  style={{
                                    display: "inline-block",
                                    padding: "3px 10px",
                                    borderRadius: 20,
                                    fontSize: 11,
                                    fontFamily: MONO,
                                    color: "#6a6560",
                                    background: "rgba(10,10,10,0.04)",
                                    border: "1px solid rgba(10,10,10,0.08)",
                                  }}
                                >
                                  {item.creditsGranted}{" "}
                                  {item.creditsGranted === 1
                                    ? "crédito"
                                    : "créditos"}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right: amount + action */}
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: 10,
                              flexShrink: 0,
                            }}
                          >
                            <p
                              style={{
                                fontSize: 20,
                                fontWeight: 500,
                                letterSpacing: -0.6,
                                margin: 0,
                                fontVariantNumeric: "tabular-nums",
                                color: "#0a0a0a",
                              }}
                            >
                              {formatAmount(item.amountInCents, item.currency)}
                            </p>
                            {item.paidAt && (
                              <p
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 10,
                                  color: "#8a8a85",
                                  margin: 0,
                                }}
                              >
                                Pago em {formatDateTime(item.paidAt)}
                              </p>
                            )}
                            {item.pendingPaymentUrl && (
                              <a
                                href={item.pendingPaymentUrl}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  background: "#0a0a0a",
                                  color: "#fafaf6",
                                  borderRadius: 8,
                                  padding: "8px 14px",
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                  textDecoration: "none",
                                  letterSpacing: -0.1,
                                }}
                                className="compras-btn-dark"
                              >
                                Abrir pagamento novamente →
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Support info */}
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: "1px solid rgba(10,10,10,0.05)",
                            display: "flex",
                            gap: 20,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 10,
                              color: "#b0ada8",
                            }}
                          >
                            ID: {item.id}
                          </span>
                          {item.mpPaymentId && (
                            <span
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: "#b0ada8",
                              }}
                            >
                              MP: {item.mpPaymentId}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        .compras-btn-dark:hover { opacity: 0.82; }
        @media (max-width: 768px) {
          .compras-content { padding: 12px 16px 60px !important; }
        }
        @media (max-width: 620px) {
          .compras-summary { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 380px) {
          .compras-summary { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
