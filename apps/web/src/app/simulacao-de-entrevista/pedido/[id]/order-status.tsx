"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MOCK_INTERVIEW_OFFER as OFFER } from "@/lib/mock-interview-offer";
import type { MockInterviewPurchaseView } from "@/lib/mock-interviews-types";
import {
  card,
  label,
  MONO,
  primaryButton,
  SERIF,
} from "../../_components/flow-styles";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 45; // ~3 minutos

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function WhatsappIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.2z" />
    </svg>
  );
}

export function OrderStatus({
  initial,
  returnHint,
}: {
  initial: MockInterviewPurchaseView;
  returnHint: "falhou" | "pendente" | null;
}) {
  const [view, setView] = useState(initial);
  const [pollsLeft, setPollsLeft] = useState(MAX_POLLS);
  const polling = view.paymentStatus === "pending" && pollsLeft > 0;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!polling) return;
    timer.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/mock-interviews/purchases/${view.id}?refresh=1`,
          { cache: "no-store" },
        );
        if (response.ok) {
          setView((await response.json()) as MockInterviewPurchaseView);
        }
      } catch {
        // rede instável: tenta de novo no próximo ciclo
      }
      setPollsLeft((n) => n - 1);
    }, POLL_INTERVAL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [polling, view.id]);

  const header = (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={label}>PEDIDO #{view.code}</span>
    </div>
  );

  if (view.paymentStatus === "paid") {
    const scheduled = view.scheduledAt && view.sessionStatus === "SCHEDULED";
    const done =
      view.sessionStatus === "COMPLETED" ||
      view.sessionStatus === "NO_SHOW" ||
      view.sessionStatus === "CANCELLED";
    return (
      <div style={{ ...card, padding: "32px 28px", display: "grid", gap: 22 }}>
        {header}
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(28px, 4vw, 36px)",
            fontWeight: 400,
            letterSpacing: -1.2,
            lineHeight: 1.1,
          }}
        >
          {done ? (
            <>
              Sua entrevista simulada{" "}
              <em style={{ fontFamily: SERIF }}>foi encerrada.</em>
            </>
          ) : scheduled ? (
            <>
              Sua entrevista simulada{" "}
              <em style={{ fontFamily: SERIF }}>está marcada.</em>
            </>
          ) : (
            <>
              Pagamento confirmado.{" "}
              <em style={{ fontFamily: SERIF }}>Agora é combinar o horário.</em>
            </>
          )}
        </h1>

        {scheduled && view.scheduledAt && (
          <div
            style={{
              background: "#fff",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 12,
              padding: "16px 18px",
              display: "grid",
              gap: 6,
            }}
          >
            <span style={label}>QUANDO</span>
            <span style={{ fontSize: 18, fontWeight: 500 }}>
              {formatDateTime(view.scheduledAt)}
            </span>
            {view.meetingUrl && (
              <a
                href={view.meetingUrl}
                rel="noopener noreferrer"
                style={{ fontSize: 14.5, color: "#0a0a0a" }}
                target="_blank"
              >
                Entrar no Google Meet →
              </a>
            )}
          </div>
        )}

        {!done && (
          <p
            style={{
              margin: 0,
              fontSize: 15.5,
              lineHeight: 1.6,
              fontWeight: 300,
              color: "#5c5a52",
            }}
          >
            {scheduled
              ? `Precisa remarcar? Me avise no WhatsApp com pelo menos ${OFFER.rescheduleHoursBefore} horas de antecedência.`
              : "Me chame no WhatsApp com o código do pedido. Você manda a vaga e combinamos juntos o dia e a hora. A sessão acontece pelo Google Meet e, depois dela, você recebe o relatório formal com as minhas recomendações."}
          </p>
        )}

        {!done &&
          (view.whatsappUrl ? (
            <a
              href={view.whatsappUrl}
              rel="noopener noreferrer"
              style={{
                ...primaryButton,
                background: "#128c4a",
                width: "100%",
                boxSizing: "border-box",
              }}
              target="_blank"
            >
              <WhatsappIcon />
              Chamar o Paulo no WhatsApp
            </a>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                background: "#fff7e6",
                border: "1px solid #f0d9a8",
                borderRadius: 10,
                padding: "12px 14px",
                color: "#7a5200",
              }}
            >
              O contato do WhatsApp ainda não está disponível. Eu vou te chamar
              pelo e-mail da sua conta para combinarmos o horário.
            </p>
          ))}

        <p style={{ margin: 0, fontSize: 13, color: "#8a8a85" }}>
          Você também recebeu a confirmação por e-mail. Seus pedidos ficam em{" "}
          <Link href="/compras" style={{ color: "#6a6a66" }}>
            Minhas compras
          </Link>
          .
        </p>
      </div>
    );
  }

  if (view.paymentStatus === "refunded") {
    return (
      <div style={{ ...card, padding: "32px 28px", display: "grid", gap: 16 }}>
        {header}
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 400,
            letterSpacing: -1,
          }}
        >
          Pedido estornado.
        </h1>
        <p
          style={{ margin: 0, fontSize: 15, fontWeight: 300, color: "#5c5a52" }}
        >
          O valor foi devolvido pelo Mercado Pago. O prazo para aparecer na sua
          fatura ou conta depende do meio de pagamento.
        </p>
      </div>
    );
  }

  if (view.paymentStatus === "failed") {
    return (
      <div style={{ ...card, padding: "32px 28px", display: "grid", gap: 18 }}>
        {header}
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 400,
            letterSpacing: -1,
          }}
        >
          O pagamento não foi aprovado.
        </h1>
        <p
          style={{ margin: 0, fontSize: 15, fontWeight: 300, color: "#5c5a52" }}
        >
          Nada foi cobrado. Você pode tentar de novo com outro cartão ou com
          Pix.
        </p>
        <Link
          href="/simulacao-de-entrevista/comprar"
          style={{ ...primaryButton, width: "100%", boxSizing: "border-box" }}
        >
          Tentar de novo
        </Link>
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: "32px 28px", display: "grid", gap: 18 }}>
      {header}
      <h1
        style={{
          margin: 0,
          fontSize: 30,
          fontWeight: 400,
          letterSpacing: -1,
          lineHeight: 1.15,
        }}
      >
        {returnHint === "falhou"
          ? "O pagamento não foi concluído."
          : "Aguardando a confirmação do pagamento."}
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 300,
          color: "#5c5a52",
          lineHeight: 1.6,
        }}
      >
        {returnHint === "falhou"
          ? "Se você desistiu ou o pagamento foi recusado, pode tentar de novo. Nada foi cobrado."
          : "Pix costuma confirmar em segundos; cartão pode levar alguns minutos. Esta página atualiza sozinha e o botão do WhatsApp aparece assim que o pagamento for aprovado."}
      </p>
      {polling ? (
        <span
          style={{ fontFamily: MONO, fontSize: 12, color: "#8a8a85" }}
          role="status"
        >
          Verificando o pagamento…
        </span>
      ) : (
        <button
          onClick={() => setPollsLeft(MAX_POLLS)}
          style={{
            ...primaryButton,
            background: "#fff",
            color: "#0a0a0a",
            border: "1px solid #d8d6ce",
            boxShadow: "none",
          }}
          type="button"
        >
          Verificar de novo
        </button>
      )}
      <Link
        href="/simulacao-de-entrevista/comprar"
        style={{ fontSize: 14, color: "#6a6a66" }}
      >
        Voltar e escolher outra forma de pagamento
      </Link>
    </div>
  );
}
