"use client";

import { useState } from "react";
import { AT } from "@/app/admin/_components/admin-primitives";
import type {
  AdminAffiliateCampaign,
  AdminAffiliateCampaignReport,
  AdminAffiliateCode,
  AdminAffiliatePartner,
} from "@/lib/admin-affiliates-api";

const PLAN_OPTIONS = ["starter", "pro", "turbo"] as const;

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function labelStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    color: AT.muted2,
    display: "block",
    marginBottom: 4,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "7px 9px",
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${AT.border}`,
    boxSizing: "border-box",
  };
}

function buttonStyle(primary = true): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: primary ? "none" : `1px solid ${AT.border}`,
    background: primary ? AT.ink : "transparent",
    color: primary ? "#fff" : AT.ink2,
    cursor: "pointer",
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message ?? "Erro ao salvar.");
  }
  return payload as T;
}

async function patchJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message ?? "Erro ao salvar.");
  }
  return payload as T;
}

export function CampanhasCupomClient({
  initialPartners,
  initialCampaigns,
}: {
  initialPartners: AdminAffiliatePartner[];
  initialCampaigns: AdminAffiliateCampaign[];
}) {
  const [partners, setPartners] = useState(initialPartners);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<
    Record<string, AdminAffiliateCampaignReport>
  >({});

  // --- Partner form ---------------------------------------------------
  const [partnerName, setPartnerName] = useState("");
  const [partnerSlug, setPartnerSlug] = useState("");

  async function handleCreatePartner() {
    setError(null);
    try {
      const partner = await postJson<AdminAffiliatePartner>(
        "/api/admin/affiliates/partners",
        { name: partnerName, slug: partnerSlug, status: "active" },
      );
      setPartners((prev) => [partner, ...prev]);
      setPartnerName("");
      setPartnerSlug("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar criador.");
    }
  }

  async function togglePartnerStatus(partner: AdminAffiliatePartner) {
    const nextStatus = partner.status === "active" ? "inactive" : "active";
    try {
      const updated = await patchJson<AdminAffiliatePartner>(
        `/api/admin/affiliates/partners/${partner.id}/status`,
        { status: nextStatus },
      );
      setPartners((prev) =>
        prev.map((p) => (p.id === partner.id ? { ...p, ...updated } : p)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  }

  // --- Campaign form ----------------------------------------------------
  const [campaignName, setCampaignName] = useState("");
  const [eligiblePlans, setEligiblePlans] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<
    "" | "percentage" | "fixed_amount"
  >("");
  const [discountValue, setDiscountValue] = useState("");
  const [bonusType, setBonusType] = useState<"" | "multiplier" | "fixed_extra">(
    "",
  );
  const [bonusValue, setBonusValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [partnershipCost, setPartnershipCost] = useState("");
  const [freeLimitTotal, setFreeLimitTotal] = useState("");

  async function handleCreateCampaign() {
    setError(null);
    try {
      const campaign = await postJson<AdminAffiliateCampaign>(
        "/api/admin/affiliates/campaigns",
        {
          name: campaignName,
          status: "active",
          eligiblePlanIds: eligiblePlans,
          ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
          ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
          ...(discountType ? { defaultDiscountType: discountType } : {}),
          ...(discountValue
            ? { defaultDiscountValue: Number(discountValue) }
            : {}),
          ...(bonusType ? { creditBonusType: bonusType } : {}),
          ...(bonusValue ? { creditBonusValue: Number(bonusValue) } : {}),
          ...(partnershipCost
            ? {
                partnershipCostInCents: Math.round(
                  Number(partnershipCost) * 100,
                ),
              }
            : {}),
          ...(freeLimitTotal
            ? { freeRedemptionLimitTotal: Number(freeLimitTotal) }
            : {}),
        },
      );
      setCampaigns((prev) => [campaign, ...prev]);
      setCampaignName("");
      setEligiblePlans([]);
      setDiscountType("");
      setDiscountValue("");
      setBonusType("");
      setBonusValue("");
      setStartsAt("");
      setEndsAt("");
      setPartnershipCost("");
      setFreeLimitTotal("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar campanha.");
    }
  }

  async function toggleCampaignStatus(campaign: AdminAffiliateCampaign) {
    const nextStatus = campaign.status === "active" ? "inactive" : "active";
    try {
      const updated = await patchJson<AdminAffiliateCampaign>(
        `/api/admin/affiliates/campaigns/${campaign.id}/status`,
        { status: nextStatus },
      );
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaign.id ? { ...c, ...updated } : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  }

  // --- Code form ----------------------------------------------------
  const [codeCampaignId, setCodeCampaignId] = useState("");
  const [codePartnerId, setCodePartnerId] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [codeLandingUrl, setCodeLandingUrl] = useState("");

  async function handleCreateCode() {
    setError(null);
    try {
      const code = await postJson<AdminAffiliateCode>(
        "/api/admin/affiliates/codes",
        {
          campaignId: codeCampaignId,
          partnerId: codePartnerId,
          code: codeValue,
          landingPageUrl: codeLandingUrl || undefined,
          status: "active",
        },
      );
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === codeCampaignId ? { ...c, codes: [...c.codes, code] } : c,
        ),
      );
      setCodeValue("");
      setCodeLandingUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar cupom.");
    }
  }

  async function toggleCodeStatus(campaignId: string, code: AdminAffiliateCode) {
    const nextStatus = code.status === "active" ? "inactive" : "active";
    try {
      const updated = await patchJson<AdminAffiliateCode>(
        `/api/admin/affiliates/codes/${code.id}/status`,
        { status: nextStatus },
      );
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId
            ? {
                ...c,
                codes: c.codes.map((existing) =>
                  existing.id === code.id ? { ...existing, ...updated } : existing,
                ),
              }
            : c,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar cupom.");
    }
  }

  async function loadReport(campaignId: string) {
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/affiliates/campaigns/${campaignId}/report`,
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message ?? "Erro no relatório.");
      setReports((prev) => ({ ...prev, [campaignId]: payload }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao buscar relatório.",
      );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {error && (
        <p style={{ color: "#9b2c2c", fontSize: 13, fontWeight: 600 }}>
          {error}
        </p>
      )}

      {/* Criadores */}
      <section
        style={{
          background: AT.card,
          border: `1px solid ${AT.border}`,
          borderRadius: 10,
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          Criadores
        </h2>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="partner-name" style={labelStyle()}>
              Nome
            </label>
            <input
              id="partner-name"
              style={inputStyle()}
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
            />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="partner-slug" style={labelStyle()}>
              Slug
            </label>
            <input
              id="partner-slug"
              style={inputStyle()}
              value={partnerSlug}
              onChange={(e) => setPartnerSlug(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              style={buttonStyle()}
              onClick={handleCreatePartner}
              disabled={!partnerName || !partnerSlug}
            >
              Criar criador
            </button>
          </div>
        </div>

        <table
          style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
        >
          <tbody>
            {partners.map((partner) => (
              <tr
                key={partner.id}
                style={{ borderTop: `1px solid ${AT.borderSoft}` }}
              >
                <td style={{ padding: "8px 4px" }}>{partner.name}</td>
                <td style={{ padding: "8px 4px", color: AT.muted }}>
                  {partner.slug}
                </td>
                <td style={{ padding: "8px 4px" }}>{partner.status}</td>
                <td style={{ padding: "8px 4px", textAlign: "right" }}>
                  <button
                    type="button"
                    style={buttonStyle(false)}
                    onClick={() => togglePartnerStatus(partner)}
                  >
                    {partner.status === "active" ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Campanhas */}
      <section
        style={{
          background: AT.card,
          border: `1px solid ${AT.border}`,
          borderRadius: 10,
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          Campanhas
        </h2>
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="campaign-name" style={labelStyle()}>
              Nome da campanha
            </label>
            <input
              id="campaign-name"
              style={inputStyle()}
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>
        </div>

        <fieldset style={{ marginBottom: 10, border: "none", padding: 0 }}>
          <legend style={labelStyle()}>Planos elegíveis</legend>
          <div style={{ display: "flex", gap: 12 }}>
            {PLAN_OPTIONS.map((planId) => (
              <label
                key={planId}
                style={{
                  fontSize: 13,
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={eligiblePlans.includes(planId)}
                  onChange={(e) => {
                    setEligiblePlans((prev) =>
                      e.target.checked
                        ? [...prev, planId]
                        : prev.filter((p) => p !== planId),
                    );
                  }}
                />
                {planId}
              </label>
            ))}
          </div>
        </fieldset>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 140px" }}>
            <label htmlFor="discount-type" style={labelStyle()}>
              Desconto — tipo
            </label>
            <select
              id="discount-type"
              style={inputStyle()}
              value={discountType}
              onChange={(e) =>
                setDiscountType(e.target.value as typeof discountType)
              }
            >
              <option value="">Nenhum</option>
              <option value="percentage">Percentual (%)</option>
              <option value="fixed_amount">Valor fixo (centavos)</option>
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label htmlFor="discount-value" style={labelStyle()}>
              Desconto — valor
            </label>
            <input
              id="discount-value"
              type="number"
              style={inputStyle()}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="bonus-type" style={labelStyle()}>
              Bônus de créditos — tipo
            </label>
            <select
              id="bonus-type"
              style={inputStyle()}
              value={bonusType}
              onChange={(e) => setBonusType(e.target.value as typeof bonusType)}
            >
              <option value="">Nenhum</option>
              <option value="multiplier">Multiplicador (ex.: 2 = 2x)</option>
              <option value="fixed_extra">Créditos extras fixos</option>
            </select>
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label htmlFor="bonus-value" style={labelStyle()}>
              Bônus — valor
            </label>
            <input
              id="bonus-value"
              type="number"
              style={inputStyle()}
              value={bonusValue}
              onChange={(e) => setBonusValue(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="campaign-starts-at" style={labelStyle()}>
              Início (opcional)
            </label>
            <input
              id="campaign-starts-at"
              type="date"
              style={inputStyle()}
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="campaign-ends-at" style={labelStyle()}>
              Fim (opcional)
            </label>
            <input
              id="campaign-ends-at"
              type="date"
              style={inputStyle()}
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="partnership-cost" style={labelStyle()}>
              Custo da parceria (R$)
            </label>
            <input
              id="partnership-cost"
              type="number"
              style={inputStyle()}
              value={partnershipCost}
              onChange={(e) => setPartnershipCost(e.target.value)}
            />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="free-limit-total" style={labelStyle()}>
              Limite total de resgates gratuitos
              {discountType === "percentage" && Number(discountValue) >= 100
                ? " (obrigatório)"
                : ""}
            </label>
            <input
              id="free-limit-total"
              type="number"
              style={inputStyle()}
              value={freeLimitTotal}
              onChange={(e) => setFreeLimitTotal(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          style={buttonStyle()}
          onClick={handleCreateCampaign}
          disabled={!campaignName || eligiblePlans.length === 0}
        >
          Criar campanha
        </button>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {campaigns.map((campaign) => {
            const report = reports[campaign.id];
            return (
              <div
                key={campaign.id}
                style={{
                  border: `1px solid ${AT.borderSoft}`,
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{campaign.name}</strong>{" "}
                    <span style={{ fontSize: 12, color: AT.muted }}>
                      — {campaign.status}
                    </span>
                    <div
                      style={{ fontSize: 12, color: AT.muted, marginTop: 2 }}
                    >
                      Criadores:{" "}
                      {Array.from(
                        new Set(campaign.codes.map((c) => c.partner.name)),
                      ).join(", ") || "—"}
                    </div>
                    <div
                      style={{ fontSize: 12, color: AT.muted, marginTop: 2 }}
                    >
                      Planos: {campaign.eligiblePlanIds.join(", ") || "—"} ·
                      Resgates gratuitos: {campaign.freeRedemptionsUsed}/
                      {campaign.freeRedemptionLimitTotal ?? "∞"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={buttonStyle(false)}
                      onClick={() => toggleCampaignStatus(campaign)}
                    >
                      {campaign.status === "active" ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      style={buttonStyle(false)}
                      onClick={() => loadReport(campaign.id)}
                    >
                      Ver relatório
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: AT.muted,
                      marginBottom: 4,
                    }}
                  >
                    Códigos:
                  </div>
                  {campaign.codes.length === 0 ? (
                    <div style={{ fontSize: 12, color: AT.muted }}>
                      nenhum
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      {campaign.codes.map((code) => (
                        <div
                          key={code.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            fontSize: 12,
                            padding: "4px 8px",
                            borderRadius: 4,
                            background: AT.bgAlt,
                          }}
                        >
                          <span>
                            {code.code} —{" "}
                            <span style={{ color: AT.muted }}>
                              {code.partner.name}
                            </span>{" "}
                            <span style={{ color: AT.muted }}>
                              ({code.status})
                            </span>
                          </span>
                          <button
                            type="button"
                            style={{
                              ...buttonStyle(false),
                              padding: "3px 8px",
                              fontSize: 11,
                            }}
                            onClick={() => toggleCodeStatus(campaign.id, code)}
                          >
                            {code.status === "active"
                              ? "Desativar"
                              : "Ativar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {report && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      background: AT.bgAlt,
                      borderRadius: 6,
                      fontSize: 12,
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 8,
                    }}
                  >
                    <div>
                      <strong>Visitas</strong> (
                      {report.metrics.visits.confidence})
                      <div>{report.metrics.visits.value}</div>
                    </div>
                    <div>
                      <strong>Cadastros</strong> (
                      {report.metrics.signups.confidence})
                      <div>{report.metrics.signups.value}</div>
                    </div>
                    <div>
                      <strong>Compras aprovadas</strong>
                      <div>{report.metrics.approvedPurchases.value}</div>
                    </div>
                    <div>
                      <strong>Compradores únicos</strong>
                      <div>{report.metrics.uniqueBuyers.value}</div>
                    </div>
                    <div>
                      <strong>Receita</strong>
                      <div>
                        {formatCents(report.metrics.revenueInCents.value)}
                      </div>
                    </div>
                    <div>
                      <strong>Desconto concedido</strong>
                      <div>
                        {formatCents(
                          report.metrics.discountGrantedInCents.value,
                        )}
                      </div>
                    </div>
                    <div>
                      <strong>Bônus de créditos</strong>
                      <div>{report.metrics.bonusCreditsGranted.value}</div>
                    </div>
                    {report.metrics.cacPerSignupInCents && (
                      <div>
                        <strong>CAC/cadastro</strong> (best-effort)
                        <div>
                          {formatCents(
                            report.metrics.cacPerSignupInCents.value,
                          )}
                        </div>
                      </div>
                    )}
                    {report.metrics.cacPerBuyerInCents && (
                      <div>
                        <strong>CAC/comprador</strong> (best-effort)
                        <div>
                          {formatCents(report.metrics.cacPerBuyerInCents.value)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Códigos */}
      <section
        style={{
          background: AT.card,
          border: `1px solid ${AT.border}`,
          borderRadius: 10,
          padding: 18,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          Códigos de cupom
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="code-campaign" style={labelStyle()}>
              Campanha
            </label>
            <select
              id="code-campaign"
              style={inputStyle()}
              value={codeCampaignId}
              onChange={(e) => setCodeCampaignId(e.target.value)}
            >
              <option value="">Selecione</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor="code-partner" style={labelStyle()}>
              Criador
            </label>
            <select
              id="code-partner"
              style={inputStyle()}
              value={codePartnerId}
              onChange={(e) => setCodePartnerId(e.target.value)}
            >
              <option value="">Selecione</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="code-value" style={labelStyle()}>
              Código
            </label>
            <input
              id="code-value"
              style={inputStyle()}
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
            />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <label htmlFor="code-landing-url" style={labelStyle()}>
              Link de destino (opcional)
            </label>
            <input
              id="code-landing-url"
              style={inputStyle()}
              value={codeLandingUrl}
              onChange={(e) => setCodeLandingUrl(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <button
              type="button"
              style={buttonStyle()}
              onClick={handleCreateCode}
              disabled={!codeCampaignId || !codePartnerId || !codeValue}
            >
              Criar código
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: AT.muted, marginTop: 8 }}>
          Link para o criador divulgar: {"{FRONTEND_URL}"}?ref=
          {codeValue || "<código>"}
        </p>
      </section>
    </div>
  );
}
