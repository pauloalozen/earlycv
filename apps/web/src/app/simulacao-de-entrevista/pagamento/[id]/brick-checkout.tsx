"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Logo } from "@/components/logo";
import { PageShell } from "@/components/page-shell";
import {
  extractBrickErrorMessage,
  resolveBrickSubmitPayload,
  toImageDataUrl,
} from "@/lib/mercadopago-brick";
import { MOCK_INTERVIEW_OFFER as OFFER } from "@/lib/mock-interview-offer";
import type { MockInterviewPurchaseView } from "@/lib/mock-interviews-types";

// Checkout da entrevista simulada com o Payment Brick do Mercado Pago — o
// mesmo checkout dos planos (/pagamento/checkout/[purchaseId]): o pagamento
// acontece dentro do EarlyCV, sem redirecionar para o Mercado Pago.

type BrickCheckoutData = {
  purchaseId: string;
  code: string;
  amount: number;
  amountInCents: number;
  currency: string;
  description: string;
  payerEmail: string | null;
};

type BrickPayResponse = {
  purchaseId: string;
  status: "approved" | "pending";
  redirectTo: string;
  qrCodeBase64: string | null;
  qrCodeText: string | null;
};

type ApiError = { errorCode?: string; message?: string; orderPath?: string };

const MONO = "var(--font-geist-mono), monospace";
const SERIF = "var(--font-serif), Georgia, serif";
const POLL_INTERVAL_MS = 3000;

const INCLUDED = [
  `${OFFER.durationMinutes} minutos ao vivo pelo Google Meet`,
  "Perguntas baseadas na vaga que você vai disputar",
  "Feedback durante e no final da sessão",
  "Relatório formal com as minhas recomendações",
] as const;

function orderPath(purchaseId: string) {
  return `/simulacao-de-entrevista/pedido/${purchaseId}`;
}

export function MockInterviewBrickCheckout({
  purchaseId,
}: {
  purchaseId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<BrickCheckoutData | null>(null);
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
  const brickControlRef = useRef<{ unmount?: () => void } | null>(null);
  const brickInitializedRef = useRef(false);
  const submitAttemptedRef = useRef(false);

  const fail = useCallback((message: string) => setError(message), []);

  // Dados do pedido. Pedido já pago/em andamento vai direto para a página do
  // pedido (ex.: voltar do navegador depois de pagar).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/mock-interviews/purchases/${purchaseId}/brick`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => ({}))) as
          | BrickCheckoutData
          | ApiError;
        if (cancelled) return;
        if (response.ok) {
          setData(body as BrickCheckoutData);
          return;
        }
        if (response.status === 409) {
          router.replace((body as ApiError).orderPath ?? orderPath(purchaseId));
          return;
        }
        fail(
          response.status === 404
            ? "Pedido não encontrado."
            : "Não foi possível carregar o pagamento. Tente novamente.",
        );
      } catch {
        if (!cancelled) {
          fail("Não foi possível carregar o pagamento. Tente novamente.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [purchaseId, router, fail]);

  // SDK do Mercado Pago (o mesmo script dos planos).
  useEffect(() => {
    if (document.getElementById("mercadopago-sdk")) {
      setSdkReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "mercadopago-sdk";
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () =>
      fail("Não foi possível carregar o pagamento. Tente novamente.");
    document.body.appendChild(script);
  }, [fail]);

  useEffect(() => {
    if (!sdkReady || !data || brickInitializedRef.current) return;

    const publicKey =
      process.env.NEXT_PUBLIC_MERCADOPAGO_BRICK_PUBLIC_KEY ??
      process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
    if (!publicKey?.trim() || !window.MercadoPago) {
      fail("Pagamento indisponível no momento. Tente novamente mais tarde.");
      return;
    }

    const MercadoPagoCtor = window.MercadoPago;
    brickInitializedRef.current = true;

    const mount = async () => {
      try {
        const mp = new MercadoPagoCtor(publicKey, { locale: "pt-BR" });
        const control = await mp
          .bricks()
          .create("payment", "mock-interview-brick-container", {
            initialization: {
              amount: data.amount,
              ...(data.payerEmail ? { payer: { email: data.payerEmail } } : {}),
            },
            customization: {
              paymentMethods: { creditCard: "all", bankTransfer: "all" },
            },
            callbacks: {
              // Obrigatório para o Brick montar (sem ele: "Callbacks onReady
              // and/or onError are required").
              onReady: () => undefined,
              onSubmit: async (submitPayload: unknown) => {
                submitAttemptedRef.current = true;
                setSubmitLoading(true);
                setSubmitError(null);
                try {
                  const response = await fetch(
                    `/api/mock-interviews/purchases/${data.purchaseId}/brick/pay`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(
                        resolveBrickSubmitPayload(
                          submitPayload,
                          data.payerEmail,
                        ),
                      ),
                    },
                  );
                  const body = (await response.json().catch(() => ({}))) as
                    | BrickPayResponse
                    | ApiError;
                  if (!response.ok) {
                    throw new Error(
                      (body as ApiError).message ??
                        "Não foi possível validar o pagamento. Tente novamente.",
                    );
                  }
                  const result = body as BrickPayResponse;
                  if (result.status === "approved") {
                    router.push(result.redirectTo);
                    return;
                  }
                  setAwaitingApproval(true);
                  if (result.qrCodeBase64 || result.qrCodeText) {
                    setPixCopied(false);
                    setPixPending({
                      qrCodeBase64: result.qrCodeBase64,
                      qrCodeText: result.qrCodeText,
                    });
                  }
                } catch (caught) {
                  setSubmitError(
                    caught instanceof Error && caught.message.trim()
                      ? caught.message
                      : "Não foi possível validar o pagamento. Tente novamente.",
                  );
                  throw new Error("submit_failed");
                } finally {
                  setSubmitLoading(false);
                }
              },
              onError: (brickError) => {
                const detail = extractBrickErrorMessage(brickError);
                if (
                  !submitAttemptedRef.current &&
                  /No payment type was selected/i.test(detail)
                ) {
                  setSubmitError(
                    "Não foi possível carregar os meios de pagamento. Tente novamente em instantes.",
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
      } catch (caught) {
        fail(
          (process.env.NEXT_PUBLIC_APP_ENV ?? "development") === "production"
            ? "Não foi possível iniciar o pagamento. Tente novamente em instantes."
            : `Não foi possível iniciar o pagamento. ${extractBrickErrorMessage(caught)}`,
        );
      }
    };
    void mount();

    return () => {
      brickControlRef.current?.unmount?.();
      brickControlRef.current = null;
      brickInitializedRef.current = false;
    };
  }, [data, sdkReady, router, fail]);

  // Pix / cartão em análise: acompanha até o webhook confirmar.
  useEffect(() => {
    if (!awaitingApproval) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/mock-interviews/purchases/${purchaseId}?refresh=1`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) return;
        const view = (await response.json()) as MockInterviewPurchaseView;
        if (view.paymentStatus === "paid") {
          router.push(orderPath(purchaseId));
        } else if (view.paymentStatus === "failed") {
          setAwaitingApproval(false);
          setPixPending(null);
          setSubmitError("Pagamento não aprovado. Tente novamente.");
        }
      } catch {
        // erro transitório: tenta de novo no próximo ciclo
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [awaitingApproval, purchaseId, router]);

  async function copyPixCode() {
    if (!pixPending?.qrCodeText) return;
    try {
      await navigator.clipboard.writeText(pixPending.qrCodeText);
      setPixCopied(true);
    } catch {
      setSubmitError("Não foi possível copiar o código Pix automaticamente.");
    }
  }

  return (
    <PageShell>
      <div
        style={{
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          fontFamily: "var(--font-geist), -apple-system, system-ui, sans-serif",
          color: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
        }}
      >
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
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Logo size="md" />
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
            <span style={{ color: "#a0a098" }}>ENTREVISTA SIMULADA</span>
            <span style={{ color: "#c8c6bf" }}>/</span>
            <span style={{ fontWeight: 500 }}>PAGAMENTO</span>
          </div>
          <span
            className="hidden md:inline-flex"
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#3a3a38",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 6,
              padding: "6px 10px",
              background: "rgba(255,255,255,0.5)",
            }}
          >
            conexão segura · ssl/tls
          </span>
        </nav>

        {loading && (
          <div
            data-testid="mock-interview-checkout-loading"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
            <p style={{ fontSize: 14, color: "#8a8a85" }}>
              Carregando pagamento...
            </p>
          </div>
        )}

        {!loading && error && (
          <div
            data-testid="mock-interview-checkout-error"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
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
              }}
            >
              <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
                Finalizar pagamento
              </h1>
              <p style={{ fontSize: 14, color: "#5a5a55", marginBottom: 20 }}>
                {error}
              </p>
              <Link
                href={OFFER.path}
                style={{ fontSize: 13, color: "#3a3a38" }}
              >
                Voltar para a entrevista simulada
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <div
            className="flex-1 flex flex-col md:grid"
            data-testid="mock-interview-checkout"
            style={{ gridTemplateColumns: "520px 1fr" }}
          >
            <aside
              className="md:border-r border-[rgba(10,10,10,0.06)]"
              style={{
                padding: "40px 36px 32px",
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
                <em style={{ fontFamily: SERIF, fontWeight: 400 }}>
                  pagamento.
                </em>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: "#5a5a55",
                  lineHeight: 1.55,
                  margin: "0 0 24px",
                  maxWidth: 380,
                }}
              >
                Assim que o pagamento for confirmado, o botão do WhatsApp
                aparece para combinarmos o horário.
              </p>

              <div
                style={{
                  background: "#fafaf6",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 14,
                  padding: "20px 22px",
                  display: "grid",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
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
                      ENTREVISTA SIMULADA
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>
                      {data.description}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 500,
                      letterSpacing: "-0.03em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: data.currency,
                    }).format(data.amount)}
                  </div>
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "grid",
                    gap: 6,
                    fontSize: 13.5,
                    color: "#3a3a38",
                  }}
                >
                  {INCLUDED.map((item) => (
                    <li key={item}>
                      <span aria-hidden="true" style={{ color: "#405410" }}>
                        ✓
                      </span>{" "}
                      {item}
                    </li>
                  ))}
                </ul>
                <div
                  style={{
                    height: 1,
                    background: "rgba(10,10,10,0.06)",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#8a8a85",
                  }}
                >
                  <span>PAGAMENTO ÚNICO</span>
                  <span>pedido #{data.code}</span>
                </div>
              </div>

              <p
                style={{
                  margin: "18px 0 0",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: "#6a6560",
                }}
              >
                Reembolso integral até {OFFER.refundHoursBefore}h antes do
                horário agendado. Remarcação com {OFFER.rescheduleHoursBefore}h
                de antecedência. Ausência não tem reembolso.
              </p>
            </aside>

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

              <div
                className={
                  pixPending
                    ? "flex-1 flex flex-col md:grid md:grid-cols-2 md:gap-5"
                    : "flex-1 flex flex-col"
                }
              >
                <div
                  className={
                    submitLoading || awaitingApproval
                      ? "pointer-events-none opacity-70"
                      : ""
                  }
                  data-testid="mock-interview-brick-container"
                  id="mock-interview-brick-container"
                />

                {pixPending && (
                  <div
                    className="md:mt-0 md:self-start"
                    data-testid="mock-interview-pix-panel"
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(10,10,10,0.08)",
                      background: "#fafaf6",
                      padding: "18px 20px",
                      marginTop: 12,
                    }}
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
                    <p
                      style={{
                        fontSize: 12,
                        color: "#5a5a55",
                        lineHeight: 1.5,
                        marginBottom: 14,
                      }}
                    >
                      Pague com o QR Code ou copie o código. Esta página segue
                      sozinha para o seu pedido assim que o pagamento cair.
                    </p>
                    {pixPending.qrCodeBase64 && (
                      <Image
                        alt="QR Code Pix"
                        height={180}
                        src={toImageDataUrl(pixPending.qrCodeBase64)}
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
                        unoptimized
                        width={180}
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
                          >
                            {pixPending.qrCodeText}
                          </span>
                          <button
                            onClick={() => {
                              void copyPixCode();
                            }}
                            style={{
                              background: "#0a0a0a",
                              color: "#fafaf6",
                              border: "none",
                              borderRadius: 6,
                              padding: "7px 11px",
                              cursor: "pointer",
                              fontFamily: MONO,
                              fontSize: 10.5,
                              flexShrink: 0,
                            }}
                            type="button"
                          >
                            copiar
                          </button>
                        </div>
                        {pixCopied && (
                          <p style={{ fontSize: 12, color: "#405410" }}>
                            Código copiado.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {awaitingApproval && !pixPending && (
                <div
                  style={{
                    borderRadius: 12,
                    border: "1px solid rgba(10,10,10,0.08)",
                    background: "#fafaf6",
                    padding: "16px 18px",
                    marginTop: 12,
                  }}
                >
                  <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    Pagamento em processamento
                  </p>
                  <p style={{ fontSize: 12, color: "#5a5a55" }}>
                    Aguardando confirmação. Você vai para o seu pedido
                    automaticamente quando for aprovado.
                  </p>
                </div>
              )}

              {submitLoading && (
                <p style={{ fontSize: 13, color: "#8a8a85", marginTop: 10 }}>
                  Validando pagamento...
                </p>
              )}

              {submitError && (
                <div
                  data-testid="mock-interview-submit-error"
                  role="alert"
                  style={{
                    marginTop: 10,
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: "rgba(220,38,38,0.05)",
                    border: "1px solid rgba(220,38,38,0.15)",
                  }}
                >
                  <p style={{ fontSize: 13, color: "#b91c1c" }}>
                    {submitError}
                  </p>
                </div>
              )}

              <p
                style={{
                  marginTop: 12,
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
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
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}
