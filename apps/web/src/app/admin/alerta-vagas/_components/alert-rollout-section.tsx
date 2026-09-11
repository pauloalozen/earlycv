"use client";

import { useState } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AT } from "@/app/admin/_components/admin-primitives";
import type {
  AlertRolloutPolicy,
  AlertRolloutPreview,
  AlertRolloutSegment,
} from "@/lib/admin-monitor-api";
import {
  applyAlertRolloutAction,
  previewAlertRolloutAction,
  updateAlertRolloutPolicyAction,
} from "../actions";

const SEGMENT_OPTIONS: { value: AlertRolloutSegment; label: string }[] = [
  { value: "ALL", label: "Toda a base" },
  { value: "PAID", label: "Quem já pagou algum plano" },
  {
    value: "TRACKED_PAID",
    label: "Lista já cadastrada manualmente + pagantes",
  },
  { value: "TRACKED_ONLY", label: "Só a lista já cadastrada manualmente" },
];

const POLICY_SEGMENT_OPTIONS: { value: "ALL" | "PAID"; label: string }[] = [
  { value: "ALL", label: "Toda a base" },
  { value: "PAID", label: "Quem pagar algum plano" },
];

export function AlertRolloutSection({
  redirectPath,
  policy,
}: {
  redirectPath: string;
  policy: AlertRolloutPolicy;
}) {
  const [segment, setSegment] = useState<AlertRolloutSegment>("ALL");
  const [confirming, setConfirming] = useState<{
    enable: boolean;
    preview: AlertRolloutPreview;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function openConfirm(enable: boolean) {
    setError(null);
    setLoadingPreview(true);
    try {
      const preview = await previewAlertRolloutAction(segment, enable);
      setConfirming({ enable, preview });
    } catch {
      setError("Falha ao calcular quantos usuários seriam afetados.");
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ marginBottom: 12 }}>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: AT.ink,
            margin: "0 0 3px",
          }}
        >
          Ativação em massa
        </h2>
        <p style={{ fontSize: 12.5, color: AT.muted, margin: 0, maxWidth: 760 }}>
          Ativa ou desativa o Alerta pra um segmento inteiro de usuários de
          uma vez. Nunca reinscreve quem já cancelou os e-mails.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <select
          value={segment}
          onChange={(e) => setSegment(e.target.value as AlertRolloutSegment)}
          style={{
            height: 36,
            borderRadius: 8,
            border: `1px solid ${AT.border}`,
            background: AT.card,
            color: AT.ink2,
            padding: "0 10px",
            fontSize: 12.5,
          }}
        >
          {SEGMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          className={buttonVariants({ size: "sm" })}
          disabled={loadingPreview}
          onClick={() => openConfirm(true)}
          type="button"
        >
          Ativar
        </button>
        <button
          className={buttonVariants({ size: "sm", variant: "outline" })}
          disabled={loadingPreview}
          onClick={() => openConfirm(false)}
          type="button"
        >
          Desativar
        </button>
      </div>

      {error && <p style={{ color: AT.danger, fontSize: 12.5 }}>{error}</p>}

      <div
        style={{
          border: `1px solid ${AT.border}`,
          borderRadius: 10,
          padding: 16,
          background: AT.card,
          maxWidth: 560,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: AT.ink,
            margin: "0 0 6px",
          }}
        >
          Auto-inscrição contínua
        </h3>
        <p style={{ fontSize: 12, color: AT.muted, margin: "0 0 12px" }}>
          Mantém usuário novo (ou pagante novo) entrando automaticamente no
          Alerta, sem precisar repetir a ativação em massa. Roda em
          background, com atraso de poucos minutos — não é instantâneo.
        </p>
        <form
          action={updateAlertRolloutPolicyAction}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input name="redirectPath" type="hidden" value={redirectPath} />
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: AT.ink2,
            }}
          >
            <input
              defaultChecked={policy.active}
              name="active"
              type="checkbox"
              value="true"
            />
            Ativa
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12.5,
              color: AT.ink2,
            }}
          >
            Segmento
            <select
              defaultValue={
                policy.segment === "ALL" || policy.segment === "PAID"
                  ? policy.segment
                  : "ALL"
              }
              name="segment"
              style={{
                height: 34,
                borderRadius: 8,
                border: `1px solid ${AT.border}`,
                padding: "0 10px",
              }}
            >
              {POLICY_SEGMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 12.5,
              color: AT.ink2,
            }}
          >
            Data de corte (opcional — em branco = sem corte, vale
            indefinidamente)
            <input
              defaultValue={
                policy.cutoffAt ? policy.cutoffAt.slice(0, 10) : ""
              }
              name="cutoffAt"
              style={{
                height: 34,
                borderRadius: 8,
                border: `1px solid ${AT.border}`,
                padding: "0 10px",
              }}
              type="date"
            />
          </label>
          <button
            className={buttonVariants({ size: "sm" })}
            style={{ alignSelf: "flex-start" }}
            type="submit"
          >
            Salvar política
          </button>
        </form>
        {policy.lastAppliedAt && (
          <p style={{ fontSize: 11.5, color: AT.faint, marginTop: 10 }}>
            Última inscrição automática:{" "}
            {new Date(policy.lastAppliedAt).toLocaleString("pt-BR")}
          </p>
        )}
      </div>

      {confirming && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,10,10,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: AT.card,
              border: `1px solid ${AT.border}`,
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(10,10,10,0.25)",
              padding: 20,
              width: 380,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600, color: AT.ink }}>
              {confirming.enable ? "Ativar" : "Desativar"} em massa
            </h3>
            <p style={{ fontSize: 12.5, color: AT.muted }}>
              Segmento <strong style={{ color: AT.ink }}>
                {SEGMENT_OPTIONS.find((o) => o.value === segment)?.label}
              </strong>{" "}
              — <strong style={{ color: AT.ink }}>
                {confirming.preview.matchingCount}
              </strong>{" "}
              usuário(s) no segmento,{" "}
              <strong style={{ color: AT.ink }}>
                {confirming.preview.willChangeCount}
              </strong>{" "}
              vão mudar de estado.
              {confirming.enable &&
                confirming.preview.skippedUnsubscribedCount > 0 && (
                  <>
                    {" "}
                    <strong style={{ color: AT.ink }}>
                      {confirming.preview.skippedUnsubscribedCount}
                    </strong>{" "}
                    já cancelaram os e-mails antes e ficam de fora, de
                    propósito.
                  </>
                )}
            </p>
            <form
              action={applyAlertRolloutAction}
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 4,
              }}
            >
              <input name="redirectPath" type="hidden" value={redirectPath} />
              <input name="segment" type="hidden" value={segment} />
              <input
                name="enable"
                type="hidden"
                value={String(confirming.enable)}
              />
              <button
                className={buttonVariants({ size: "sm", variant: "outline" })}
                onClick={() => setConfirming(null)}
                type="button"
              >
                Cancelar
              </button>
              <button className={buttonVariants({ size: "sm" })} type="submit">
                Confirmar {confirming.preview.willChangeCount} mudança(s)
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
