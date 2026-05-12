"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
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

  return (
    <AuthMonoShell>
      {loading && (
        <div className="text-center" data-testid="brick-checkout-loading">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111] mx-auto mb-4" />
          <p className="text-sm text-gray-500">Carregando checkout...</p>
        </div>
      )}

      {!loading && error && (
        <div className="text-center" data-testid="brick-checkout-error">
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">Finalizar pagamento</h1>
          <p className="text-sm text-gray-600 mb-6">{error}</p>
          <Link href="/compras" className="text-sm underline text-gray-700">
            Voltar para compras
          </Link>
        </div>
      )}

      {!loading && !error && data && (
        <div data-testid="brick-checkout-summary">
          <h1 className="text-2xl font-semibold text-gray-900 mb-3">Finalizar pagamento</h1>
          <div className="rounded-[12px] border border-[rgba(10,10,10,0.1)] bg-white p-4 mb-5">
            <p className="text-sm text-gray-500 mb-1">Resumo da compra</p>
            <p className="text-base text-gray-900 mb-1">{data.description}</p>
            <p className="text-sm text-gray-700 mb-1">
              Valor: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: data.currency }).format(data.amount)}
            </p>
            <p className="text-sm text-gray-700">Status: {data.status}</p>
          </div>

          <div
            id="payment-brick-container"
            data-testid="payment-brick-container"
            className={`rounded-[12px] border border-[rgba(10,10,10,0.1)] bg-white p-4 mb-4 ${submitLoading || awaitingApproval ? "pointer-events-none opacity-70" : ""}`}
          />

          {awaitingApproval && !pixPending && (
            <div
              className="rounded-[12px] border border-[rgba(10,10,10,0.12)] bg-white p-4 mb-4"
              data-testid="payment-processing-panel"
            >
              <p className="text-sm text-gray-900 mb-2">Pagamento em processamento</p>
              <p className="text-xs text-gray-600">
                Estamos aguardando a confirmacao do pagamento. Assim que aprovado, voce sera
                redirecionado automaticamente.
              </p>
            </div>
          )}

          {pixPending && (
            <div
              className="rounded-[12px] border border-[rgba(10,10,10,0.12)] bg-white p-4 mb-4"
              data-testid="pix-pending-panel"
            >
              <p className="text-sm text-gray-900 mb-2">Aguardando pagamento via PIX</p>
              <p className="text-xs text-gray-600 mb-3">
                Pague com o QR Code ou copie o codigo PIX. Assim que o pagamento for confirmado,
                voce sera redirecionado automaticamente.
              </p>
              {pixPending.qrCodeBase64 && (
                <img
                  src={toImageDataUrl(pixPending.qrCodeBase64)}
                  alt="QR Code PIX"
                  className="w-[220px] h-[220px] mb-3 border border-[rgba(10,10,10,0.1)] rounded-[8px]"
                />
              )}
              {pixPending.qrCodeText && (
                <>
                  <p
                    className="text-xs text-gray-700 break-all rounded-[8px] bg-gray-50 p-3 mb-2"
                    data-testid="pix-copy-code"
                  >
                    {pixPending.qrCodeText}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      void copyPixCode();
                    }}
                    className="text-sm underline text-gray-700"
                  >
                    Copiar codigo PIX
                  </button>
                  {pixCopied && (
                    <p className="text-xs text-emerald-700 mt-2" data-testid="pix-copy-feedback">
                      Codigo copiado.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {submitLoading && (
            <p className="text-sm text-gray-500 mb-3" data-testid="brick-submit-loading">
              Validando pagamento...
            </p>
          )}

          {submitError && (
            <p className="text-sm text-red-700 mb-3" data-testid="brick-submit-error">
              {submitError}
            </p>
          )}

          {!isProduction && brickRuntimeError && (
            <p className="text-xs text-amber-700 mb-3" data-testid="brick-runtime-error-detail">
              Detalhe tecnico (dev): {brickRuntimeError}
            </p>
          )}

          {!submitAttemptedRef.current && !submitLoading && !awaitingApproval && !submitError && (
            <p className="text-sm text-gray-600 mb-6">Pagamento via Mercado Pago sera carregado aqui.</p>
          )}
          <Link href="/compras" className="text-sm underline text-gray-700">
            Voltar para compras
          </Link>
        </div>
      )}
    </AuthMonoShell>
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
