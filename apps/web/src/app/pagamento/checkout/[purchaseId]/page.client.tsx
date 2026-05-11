"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  getBrickCheckoutClient,
  submitBrickPaymentClient,
  type CheckoutApiError,
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
  const [dryRunMessage, setDryRunMessage] = useState<string | null>(null);
  const [brickRuntimeError, setBrickRuntimeError] = useState<string | null>(null);
  const [showDryRunFallback, setShowDryRunFallback] = useState(false);
  const brickControlRef = useRef<{ unmount?: () => void } | null>(null);
  const brickInitializedRef = useRef(false);
  const submitAttemptedRef = useRef(false);
  const isProduction =
    (process.env.NEXT_PUBLIC_APP_ENV ?? "development") === "production";
  const isLocalHostRuntime =
    (process.env.NEXT_PUBLIC_PAYMENT_BRICK_LOCAL_DEGRADED ?? "false") ===
    "true";

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
    if (isLocalHostRuntime) {
      setShowDryRunFallback(true);
      return;
    }
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
  }, [isLocalHostRuntime, applyUiError]);

  useEffect(() => {
    if (!data) return;

    const validationError = getCheckoutValidationError(data);
    if (validationError) {
      applyUiError(validationError);
      return;
    }
  }, [data, applyUiError]);

  useEffect(() => {
    if (isLocalHostRuntime) return;
    if (!sdkReady || !data || brickInitializedRef.current) return;

    const dataValidationError = getCheckoutValidationError(data);
    if (dataValidationError) {
      applyUiError(dataValidationError);
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
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
            onSubmit: async (formData: unknown) => {
              submitAttemptedRef.current = true;
              setBrickRuntimeError(null);
              setSubmitLoading(true);
              setSubmitError(null);
              setDryRunMessage(null);
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
                const response = await submitBrickPaymentClient(data.purchaseId, formData);
                if (response.dryRun) {
                  void trackEvent({
                    eventName: "checkout_brick_submit_validated_dry_run",
                    properties: {
                      purchaseId: data.purchaseId,
                      originAction: data.originAction,
                      originAdaptationId: data.originAdaptationId,
                      checkoutMode: "brick",
                      amount: data.amount,
                      status: response.status,
                      dryRun: true,
                    },
                  });
                  const showMessage =
                    (process.env.NEXT_PUBLIC_APP_ENV ?? "development") !==
                    "production";
                  if (showMessage) {
                    setDryRunMessage(
                      "Pagamento validado em modo dry-run. Nenhuma cobranca foi criada.",
                    );
                  }
                }
              } catch {
                setSubmitError("Nao foi possivel validar o pagamento. Tente novamente.");
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
                setShowDryRunFallback(true);
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
          setShowDryRunFallback(true);
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
  }, [data, sdkReady, isLocalHostRuntime, applyUiError]);

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
            className="rounded-[12px] border border-[rgba(10,10,10,0.1)] bg-white p-4 mb-4"
          />

          {submitLoading && (
            <p className="text-sm text-gray-500 mb-3" data-testid="brick-submit-loading">
              Validando pagamento...
            </p>
          )}

          {showDryRunFallback && (
            <div className="mb-3 rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-[#fafaf6] p-3">
              {isLocalHostRuntime ? (
                <p className="mb-2 text-xs text-[#6a6560]">
                  Modo local: validacao direta em dry-run habilitada. O widget visual do Mercado Pago nao sera carregado aqui.
                </p>
              ) : (
                <p className="mb-2 text-xs text-[#6a6560]">
                  Nao foi possivel carregar a selecao de meio de pagamento neste ambiente.
                </p>
              )}
              <button
                type="button"
                data-testid="brick-dryrun-fallback-btn"
                disabled={submitLoading}
                onClick={async () => {
                  if (!data) return;
                  submitAttemptedRef.current = true;
                  setSubmitLoading(true);
                  setSubmitError(null);
                  setDryRunMessage(null);
                  try {
                    const response = await submitBrickPaymentClient(data.purchaseId, {
                      fallbackMode: "no_payment_type_selected",
                    });
                    if (response.dryRun) {
                      setDryRunMessage(
                        "Pagamento validado em modo dry-run. Nenhuma cobranca foi criada.",
                      );
                    }
                  } catch {
                    setSubmitError("Nao foi possivel validar o pagamento. Tente novamente.");
                  } finally {
                    setSubmitLoading(false);
                  }
                }}
                className="rounded-[8px] border border-[rgba(10,10,10,0.2)] px-3 py-2 text-sm text-[#0a0a0a]"
              >
                Validar pagamento (dry-run)
              </button>
            </div>
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

          {dryRunMessage && (
            <p className="text-sm text-amber-700 mb-3" data-testid="brick-dryrun-message">
              {dryRunMessage}
            </p>
          )}

          <p className="text-sm text-gray-600 mb-6">Pagamento via Mercado Pago sera carregado aqui.</p>
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
          },
        ) => Promise<{ unmount?: () => void }>;
      };
    };
  }
}
