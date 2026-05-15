"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Logo } from "@/components/logo";
import { PageShell } from "@/components/page-shell";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  getCheckoutStatusClient,
  getBrickCheckoutClient,
  submitBrickPaymentClient,
  type CheckoutApiError,
  type BrickPayResponse,
  type BrickCheckoutResponse,
} from "@/lib/payments-browser-api";

type Props = {
  purchaseId: string;
};

export function BrickCheckoutClientPage({ purchaseId }: Props) {
  const [data, setData] = useState<BrickCheckoutResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [pixPending, setPixPending] = useState<{
    qrCodeBase64: string | null;
    qrCodeText: string | null;
  } | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [brickRuntimeError, setBrickRuntimeError] = useState<string | null>(null);
  const brickControlRef = useRef<{ unmount?: () => void } | null>(null);
  const brickInitializedRef = useRef(false);
  const submitAttemptedRef = useRef(false);
  const router = useRouter();
  const isProduction =
    (process.env.NEXT_PUBLIC_APP_ENV ?? "development") === "production";

  const applyUiError = useCallback(
    (technicalMessage: string) => {
      if (!isProduction) {
        setError(technicalMessage);
        return;
      }
      setError(
        "Nao foi possivel carregar este checkout. Verifique sua compra e tente novamente.",
      );
    },
    [isProduction],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);
        const response = await getBrickCheckoutClient(purchaseId);
        if (!cancelled) {
          setData(response);
        }
      } catch (caught) {
        const error = caught as CheckoutApiError;
        if (!cancelled) {
          applyUiError(mapCheckoutLoadError(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [purchaseId, applyUiError]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const existing = document.getElementById("mercadopago-sdk");
    if (existing) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.id = "mercadopago-sdk";
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => applyUiError("Erro ao carregar SDK Mercado Pago");
    document.body.appendChild(script);
  }, [applyUiError]);

  useEffect(() => {
    if (!data) return;

    const validationError = getCheckoutValidationError(data);
    if (validationError) {
      applyUiError(validationError);
      return;
    }
  }, [data, applyUiError]);

  useEffect(() => {
    if (!sdkReady || !data || brickInitializedRef.current) return;

    const dataValidationError = getCheckoutValidationError(data);
    if (dataValidationError) {
      applyUiError(dataValidationError);
      return;
    }

    const publicKey =
      process.env.NEXT_PUBLIC_MERCADOPAGO_BRICK_PUBLIC_KEY ??
      process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey?.trim()) {
      applyUiError("Public key Mercado Pago ausente");
      return;
    }

    if (typeof window === "undefined" || !window.MercadoPago) {
      applyUiError("SDK de pagamento indisponivel");
      return;
    }

    const MercadoPagoCtor = window.MercadoPago;

    brickInitializedRef.current = true;

    const mount = async () => {
      try {
        const mp = new MercadoPagoCtor(publicKey, { locale: "pt-BR" });
        const bricksBuilder = mp.bricks();

        const control = await bricksBuilder.create("payment", "payment-brick-container", {
          initialization: {
            amount: data.amount,
            ...(data.payerEmail ? { payer: { email: data.payerEmail } } : {}),
          },
            customization: {
              paymentMethods: {
                creditCard: "all",
                bankTransfer: "all",
              },
            },
          callbacks: {
            onReady: () => {
              void trackEvent({
                eventName: "checkout_brick_ready",
                properties: {
                  purchaseId: data.purchaseId,
                  originAction: data.originAction,
                  originAdaptationId: data.originAdaptationId,
                  checkoutMode: "brick",
                  amount: data.amount,
                },
              });
            },
            onSubmit: async (submitPayload: unknown) => {
              submitAttemptedRef.current = true;
              setBrickRuntimeError(null);
              setSubmitLoading(true);
              setSubmitError(null);
                void trackEvent({
                eventName: "checkout_brick_submit_started",
                properties: {
                  purchaseId: data.purchaseId,
                  originAction: data.originAction,
                  originAdaptationId: data.originAdaptationId,
                  checkoutMode: "brick",
                  amount: data.amount,
                },
              });

                try {
                  const payload = resolveBrickSubmitPayload(submitPayload, data.payerEmail);
                  const response = await submitBrickPaymentClient(data.purchaseId, payload);
                  handleBrickSubmitResponse(
                    response,
                    router,
                    setAwaitingApproval,
                    setPixPending,
                    setPixCopied,
                  );
                } catch (error) {
                  const checkoutError = error as CheckoutApiError;
                  const submitMessage =
                    !isProduction && checkoutError.message?.trim()
                      ? checkoutError.message
                      : "Nao foi possivel validar o pagamento. Tente novamente.";
                  setSubmitError(submitMessage);
                void trackEvent({
                  eventName: "checkout_brick_submit_failed",
                  properties: {
                    purchaseId: data.purchaseId,
                    originAction: data.originAction,
                    originAdaptationId: data.originAdaptationId,
                    checkoutMode: "brick",
                    amount: data.amount,
                  },
                });
                throw new Error("submit_failed");
              } finally {
                setSubmitLoading(false);
              }
            },
            onError: (error) => {
              const detail = extractBrickErrorMessage(error);
              setBrickRuntimeError(detail);
              if (
                submitAttemptedRef.current === false &&
                /No payment type was selected/i.test(detail)
              ) {
                setSubmitError(
                  "Nao foi possivel carregar os meios de pagamento no Mercado Pago. Tente novamente em instantes.",
                );
                return;
              }
              if (submitAttemptedRef.current) {
                setSubmitError("Erro ao processar os dados de pagamento.");
              }
            },
          },
        });

        brickControlRef.current = control as { unmount?: () => void };
      } catch (error) {
        const detail = extractBrickErrorMessage(error);
        setBrickRuntimeError(detail);
        if (/No payment type was selected/i.test(detail)) {
          setSubmitError(
            "Nao foi possivel carregar os meios de pagamento no Mercado Pago. Tente novamente em instantes.",
          );
          return;
        }
        applyUiError(`Erro ao inicializar Payment Brick: ${detail}`);
      }
    };

    void mount();

    return () => {
      if (brickControlRef.current?.unmount) {
        brickControlRef.current.unmount();
      }
      brickControlRef.current = null;
      brickInitializedRef.current = false;
    };
  }, [data, sdkReady, applyUiError, router]);

  useEffect(() => {
    if (!awaitingApproval) return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const status = await getCheckoutStatusClient(purchaseId);
        if (cancelled) return;
        if (status.status === "approved") {
          router.push(`/pagamento/concluido?checkoutId=${purchaseId}`);
          return;
        }
        if (status.status === "failed") {
          setAwaitingApproval(false);
          setPixPending(null);
          setSubmitError(
            status.message?.trim()
              ? status.message
              : "Pagamento falhou. Tente novamente.",
          );
        }
      } catch {
        // ignore transient polling errors
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [awaitingApproval, purchaseId, router]);

  async function copyPixCode() {
    const code = pixPending?.qrCodeText;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setPixCopied(true);
    } catch {
      setSubmitError("Nao foi possivel copiar o codigo PIX automaticamente.");
    }
  }

  const MONO = "var(--font-geist-mono), monospace";
  const SERIF = "var(--font-serif), Georgia, serif";

  return (
    <PageShell>
      {/* Grain overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.45,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
        aria-hidden
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          fontFamily: "var(--font-geist), -apple-system, system-ui, sans-serif",
          color: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Nav ── */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 32px",
            borderBottom: "1px solid rgba(10,10,10,0.05)",
          }}
        >
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <Logo size="md" />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#8a8a85",
                border: "1px solid #d8d6ce",
                borderRadius: 3,
                padding: "1px 5px",
                fontWeight: 500,
              }}
            >
              v1.2
            </span>
          </a>

          <div
            className="hidden md:flex"
            style={{
              alignItems: "center",
              gap: 8,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: "0.1em",
            }}
          >
            <span style={{ color: "#a0a098" }}>PLANOS</span>
            <span style={{ color: "#c8c6bf" }}>/</span>
            <span style={{ color: "#0a0a0a", fontWeight: 500 }}>CHECKOUT</span>
          </div>

          <div
            className="hidden md:flex"
            style={{
              alignItems: "center",
              gap: 7,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: "0.04em",
              color: "#3a3a38",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 6,
              padding: "6px 10px",
              background: "rgba(255,255,255,0.5)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="11" width="16" height="10" rx="1.5" stroke="#3a3a38" strokeWidth="1.6" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#3a3a38" strokeWidth="1.6" />
            </svg>
            <span>conexão segura · ssl/tls</span>
          </div>
        </nav>

        {/* ── Loading ── */}
        {loading && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
            data-testid="brick-checkout-loading"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
            <p style={{ fontSize: 14, color: "#8a8a85" }}>Carregando checkout...</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
            data-testid="brick-checkout-error"
          >
            <div
              style={{
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 18,
                padding: "40px 36px",
                maxWidth: 420,
                width: "100%",
                textAlign: "center",
                boxShadow: "0 8px 40px -12px rgba(10,10,10,0.12)",
              }}
            >
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  marginBottom: 12,
                }}
              >
                Finalizar pagamento
              </h1>
              <p style={{ fontSize: 14, color: "#5a5a55", marginBottom: 20 }}>{error}</p>
              <Link
                href="/compras"
                style={{
                  fontSize: 13,
                  color: "#3a3a38",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationColor: "rgba(10,10,10,0.2)",
                }}
              >
                Voltar para compras
              </Link>
            </div>
          </div>
        )}

        {/* ── Main: two-column ── */}
        {!loading && !error && data && (
          <div
            className="flex-1 flex flex-col md:grid"
            style={{ gridTemplateColumns: "520px 1fr" }}
            data-testid="brick-checkout-summary"
          >
            {/* ── LEFT: Order summary ── */}
            <aside
              className="md:border-r border-[rgba(10,10,10,0.06)]"
              style={{ padding: "40px 36px 32px", display: "flex", flexDirection: "column" }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  color: "#8a8a85",
                  marginBottom: 14,
                  fontWeight: 500,
                }}
              >
                RESUMO DA COMPRA
              </div>

              <div
                style={{
                  fontSize: 34,
                  fontWeight: 500,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.1,
                  marginBottom: 10,
                }}
              >
                Finalizar{" "}
                <em style={{ fontFamily: SERIF, fontWeight: 400, fontStyle: "italic" }}>
                  pagamento.
                </em>
              </div>

              <div
                style={{
                  fontSize: 14,
                  color: "#5a5a55",
                  lineHeight: 1.55,
                  marginBottom: 24,
                  maxWidth: 380,
                }}
              >
                Acesso liberado em segundos após a confirmação. Sem cobrança recorrente.
              </div>

              {/* Item card */}
              <div
                style={{
                  background: "#fafaf6",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 14,
                  padding: "20px 22px",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.02), 0 12px 32px -20px rgba(10,10,10,0.12)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        color: "#8a8a85",
                        marginBottom: 6,
                        fontWeight: 500,
                      }}
                    >
                      PACOTE
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 500,
                        letterSpacing: "-0.02em",
                        color: "#0a0a0a",
                        marginBottom: 6,
                      }}
                    >
                      {data.description}
                    </div>
                    {/* units included chip */}
                    {data.unitsIncluded && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontFamily: MONO,
                          fontSize: 10,
                          letterSpacing: "0.06em",
                          color: "#45483a",
                          background: "rgba(198,255,58,0.22)",
                          border: "1px solid rgba(64,84,16,0.15)",
                          borderRadius: 4,
                          padding: "3px 7px",
                          fontWeight: 500,
                        }}
                      >
                        {data.unitsIncluded === 1
                          ? "1 adaptação de CV"
                          : `${data.unitsIncluded} adaptações de CV`}
                      </span>
                    )}
                  </div>
                  <PriceDisplay amount={data.amount} />
                </div>

                <div
                  style={{
                    height: 1,
                    background: "rgba(10,10,10,0.06)",
                    margin: "18px 0",
                  }}
                />

                {/* Total row with one-time badge */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: data.unitPrice && data.unitsIncluded && data.unitsIncluded > 1 ? 4 : 12,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      color: "#6a6560",
                    }}
                  >
                    Total hoje
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: "0.08em",
                        color: "#405410",
                        background: "rgba(198,255,58,0.28)",
                        border: "1px solid rgba(64,84,16,0.15)",
                        borderRadius: 3,
                        padding: "2px 5px",
                        fontWeight: 600,
                      }}
                    >
                      PAGAMENTO ÚNICO
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 17,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      color: "#0a0a0a",
                    }}
                  >
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: data.currency,
                    }).format(data.amount)}
                  </span>
                </div>

                {/* Unit price — secondary line, only shown when package has multiple units */}
                {data.unitPrice && data.unitsIncluded && data.unitsIncluded > 1 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      marginBottom: 12,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: "#a0a098",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: data.currency,
                      }).format(data.unitPrice)}
                      /adaptação
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      fontSize: 11.5,
                      color: "#7a6b15",
                      background: "rgba(245,197,24,0.14)",
                      border: "1px solid rgba(245,197,24,0.3)",
                      padding: "4px 9px",
                      borderRadius: 99,
                      fontFamily: MONO,
                      letterSpacing: "0.02em",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#f5c518",
                        boxShadow: "0 0 0 3px rgba(245,197,24,0.18)",
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                    pagamento pendente
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#a0a098",
                      letterSpacing: "0.01em",
                    }}
                  >
                    id · {data.purchaseId.slice(-12)}
                  </span>
                </div>
              </div>

              {/* Trust strip */}
              <div
                style={{
                  marginTop: "auto",
                  paddingTop: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <TrustItem val="7 dias" label="garantia de reembolso" />
                <div
                  style={{ width: 1, height: 28, background: "rgba(10,10,10,0.08)" }}
                />
                <TrustItem val="LGPD" label="dados criptografados" />
                <div
                  style={{ width: 1, height: 28, background: "rgba(10,10,10,0.08)" }}
                />
                <TrustItem val="Mercado Pago" label="processador" />
              </div>
            </aside>

            {/* ── RIGHT: Payment ── */}
            <section
              style={{
                padding: "40px 40px 32px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: "0.12em",
                  color: "#8a8a85",
                  marginBottom: 18,
                  fontWeight: 500,
                }}
              >
                MEIOS DE PAGAMENTO
              </div>

              {/* Brick + PIX side-by-side on large screens when PIX is pending */}
              <div
                className={
                  pixPending
                    ? "flex-1 flex flex-col md:grid md:grid-cols-2 md:gap-5"
                    : "flex-1 flex flex-col"
                }
              >
                {/* Brick container */}
                <div
                  id="payment-brick-container"
                  data-testid="payment-brick-container"
                  className={
                    submitLoading || awaitingApproval
                      ? "pointer-events-none opacity-70"
                      : ""
                  }
                />

                {/* PIX pending panel — right column on md+, below on mobile */}
                {pixPending && (
                  <div
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(10,10,10,0.08)",
                      background: "#fafaf6",
                      padding: "18px 20px",
                      marginTop: 12,
                    }}
                    className="md:mt-0 md:self-start"
                    data-testid="pix-pending-panel"
                  >
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: "0.12em",
                        color: "#8a8a85",
                        fontWeight: 500,
                        marginBottom: 10,
                      }}
                    >
                      AGUARDANDO PIX
                    </div>
                    <p style={{ fontSize: 12, color: "#5a5a55", lineHeight: 1.5, marginBottom: 14 }}>
                      Pague com o QR Code ou copie o código. Você será redirecionado
                      automaticamente após a confirmação.
                    </p>
                    {pixPending.qrCodeBase64 && (
                      <img
                        src={toImageDataUrl(pixPending.qrCodeBase64)}
                        alt="QR Code PIX"
                        style={{
                          width: 180,
                          height: 180,
                          marginBottom: 14,
                          border: "1px solid rgba(10,10,10,0.08)",
                          borderRadius: 8,
                          background: "#fff",
                          padding: 8,
                          display: "block",
                        }}
                      />
                    )}
                    {pixPending.qrCodeText && (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            background: "#fff",
                            border: "1px solid rgba(10,10,10,0.1)",
                            borderRadius: 9,
                            padding: "10px 10px 10px 13px",
                            marginBottom: 8,
                          }}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 10.5,
                              color: "#3a3a38",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                              minWidth: 0,
                            }}
                            data-testid="pix-copy-code"
                          >
                            {pixPending.qrCodeText}
                          </span>
                          <button
                            type="button"
                            onClick={() => { void copyPixCode(); }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              background: "#0a0a0a",
                              color: "#fafaf6",
                              border: "none",
                              borderRadius: 6,
                              padding: "7px 11px",
                              cursor: "pointer",
                              fontFamily: MONO,
                              fontSize: 10.5,
                              letterSpacing: "0.03em",
                              fontWeight: 500,
                              flexShrink: 0,
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
                              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.6" />
                            </svg>
                            copiar
                          </button>
                        </div>
                        {pixCopied && (
                          <p
                            style={{ fontSize: 12, color: "#405410" }}
                            data-testid="pix-copy-feedback"
                          >
                            Código copiado.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Processing panel (non-PIX) */}
              {awaitingApproval && !pixPending && (
                <div
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(10,10,10,0.08)",
                    background: "#fafaf6",
                    padding: "16px 18px",
                    marginTop: 12,
                  }}
                  data-testid="payment-processing-panel"
                >
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#0a0a0a", marginBottom: 4 }}>
                    Pagamento em processamento
                  </p>
                  <p style={{ fontSize: 12, color: "#5a5a55", lineHeight: 1.5 }}>
                    Aguardando confirmação. Você será redirecionado automaticamente
                    quando aprovado.
                  </p>
                </div>
              )}

              {/* Submit loading */}
              {submitLoading && (
                <p
                  style={{ fontSize: 13, color: "#8a8a85", marginTop: 10 }}
                  data-testid="brick-submit-loading"
                >
                  Validando pagamento...
                </p>
              )}

              {/* Submit error */}
              {submitError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: "rgba(220,38,38,0.05)",
                    border: "1px solid rgba(220,38,38,0.15)",
                  }}
                  data-testid="brick-submit-error"
                >
                  <p style={{ fontSize: 13, color: "#b91c1c" }}>{submitError}</p>
                </div>
              )}

              {/* Dev-only brick error */}
              {!isProduction && brickRuntimeError && (
                <p
                  style={{ fontSize: 11, color: "#92400e", marginTop: 8 }}
                  data-testid="brick-runtime-error-detail"
                >
                  Detalhe técnico (dev): {brickRuntimeError}
                </p>
              )}

              <p
                style={{
                  marginTop: 12,
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  letterSpacing: "0.02em",
                  lineHeight: 1.45,
                }}
              >
                Pagamento processado pelo Mercado Pago.{" "}
                <Link
                  href="/privacidade"
                  style={{ color: "#0a0a0a", textDecoration: "underline" }}
                >
                  Política de Privacidade
                </Link>{" "}
                e{" "}
                <Link
                  href="/termos-de-uso"
                  style={{ color: "#0a0a0a", textDecoration: "underline" }}
                >
                  Termos de Uso
                </Link>
                .
              </p>

              {/* Footer */}
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    letterSpacing: "0.03em",
                    color: "#8a8a85",
                  }}
                >
                  ↻ status atualizado em até 30s após confirmação
                </span>
                <Link
                  href="/compras"
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#3a3a38",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    textDecorationColor: "rgba(10,10,10,0.2)",
                  }}
                >
                  ← voltar para compras
                </Link>
              </div>
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}

function PriceDisplay({ amount }: { amount: number }) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const [intPart, decPart] = formatted.split(",");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 3,
        color: "#0a0a0a",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "#6a6560",
          marginTop: 4,
          fontWeight: 500,
        }}
      >
        R$
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: "-0.04em",
          lineHeight: 1,
        }}
      >
        {intPart}
        <span style={{ fontSize: 17, fontWeight: 500 }}>,{decPart}</span>
      </div>
    </div>
  );
}

function TrustItem({ val, label }: { val: string; label: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#0a0a0a",
          marginBottom: 3,
          letterSpacing: "-0.01em",
        }}
      >
        {val}
      </div>
      <div
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 9.5,
          color: "#8a8a85",
          letterSpacing: "0.04em",
          lineHeight: 1.4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function extractBrickErrorMessage(error: unknown): string {
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

function resolveBrickSubmitPayload(
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
        ? ({ ...(payload.payer as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    if (typeof payer.email !== "string" || payer.email.trim().length === 0) {
      payer.email = fallbackPayerEmail;
      payload.payer = payer;
    }
  }

  return payload;
}

function handleBrickSubmitResponse(
  response: BrickPayResponse,
  router: ReturnType<typeof useRouter>,
  setAwaitingApproval: (value: boolean) => void,
  setPixPending: (value: { qrCodeBase64: string | null; qrCodeText: string | null } | null) => void,
  setPixCopied: (value: boolean) => void,
) {
  if (response.status === "approved") {
    setAwaitingApproval(false);
    setPixPending(null);
    router.push(response.redirectTo);
    return;
  }

  setAwaitingApproval(true);
  const hasPixData =
    (typeof response.qrCodeBase64 === "string" && response.qrCodeBase64.trim().length > 0) ||
    (typeof response.qrCodeText === "string" && response.qrCodeText.trim().length > 0);

  if (!hasPixData) {
    setPixPending(null);
    return;
  }

  setPixCopied(false);
  setPixPending({
    qrCodeBase64: response.qrCodeBase64,
    qrCodeText: response.qrCodeText,
  });
}

function toImageDataUrl(rawBase64: string): string {
  const value = rawBase64.trim();
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}

function mapCheckoutLoadError(error: CheckoutApiError): string {
  if (error.errorCode === "brick_not_eligible") {
    return "Usuario nao elegivel para Brick";
  }
  if (error.errorCode === "purchase_not_found") {
    return "Compra nao encontrada";
  }
  if (error.errorCode === "purchase_status_invalid") {
    return "Status invalido para checkout";
  }
  if (error.errorCode === "purchase_amount_invalid") {
    return "Amount invalido";
  }
  if (error.errorCode === "purchase_origin_invalid") {
    return "Origem de compra invalida";
  }
  if (error.status === 401) {
    return "Nao autenticado";
  }
  if (error.status === 403) {
    return "Usuario nao elegivel para Brick";
  }
  if (error.status === 404) {
    return "Compra nao encontrada";
  }
  if (error.status === 409) {
    return "Status invalido para checkout";
  }
  return "Erro no proxy de checkout";
}

function getCheckoutValidationError(
  data: BrickCheckoutResponse,
): string | null {
  if (!data.purchaseId?.trim()) {
    return "purchaseId ausente";
  }

  if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount <= 0) {
    return "Amount invalido";
  }

  if (data.currency !== "BRL") {
    return `Moeda invalida para checkout: ${data.currency}`;
  }

  if (data.status !== "pending") {
    return `Status invalido para checkout: ${String(data.status)}`;
  }

  if (!data.description?.trim()) {
    return "Descricao ausente";
  }

  return null;
}

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string },
    ) => {
      bricks: () => {
        create: (
          brickType: string,
          containerId: string,
          settings: {
            initialization?: {
              amount?: number;
              payer?: { email?: string };
            };
            callbacks?: {
              onReady?: () => void;
              onSubmit?: (formData: unknown) => Promise<void>;
              onError?: (error: unknown) => void;
            };
            customization?: {
              paymentMethods?: {
                creditCard?: string;
                debitCard?: string;
                prepaidCard?: string;
                bankTransfer?: string;
                ticket?: string;
                mercadoPago?: string;
              };
            };
          },
        ) => Promise<{ unmount?: () => void }>;
      };
    };
  }
}
