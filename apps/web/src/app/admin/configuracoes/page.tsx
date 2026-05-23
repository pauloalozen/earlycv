import { revalidatePath } from "next/cache";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AdminPageWrap, AT } from "@/app/admin/_components/admin-primitives";
import { EmptyState, Input } from "@/components/ui";
import {
  type AdminAnalysisConfigEntry,
  listAnalysisProtectionConfigs,
  updateAnalysisProtectionConfig,
} from "@/lib/admin-analysis-config-api";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Configuracoes");

const formatDefaultValue = (entry: AdminAnalysisConfigEntry) => {
  if (Array.isArray(entry.defaultValue)) {
    return entry.defaultValue.join(", ");
  }

  if (typeof entry.defaultValue === "boolean") {
    return entry.defaultValue ? "true" : "false";
  }

  return String(entry.defaultValue ?? "");
};

const formatEditableValue = (entry: AdminAnalysisConfigEntry) => {
  if (Array.isArray(entry.value)) {
    return entry.value.join(", ");
  }

  if (typeof entry.value === "boolean") {
    return entry.value ? "true" : "false";
  }

  return String(entry.value ?? "");
};

export default function AdminSettingsPage() {
  async function updateConfig(key: string, formData: FormData) {
    "use server";
    const value = formData.get("value");

    await updateAnalysisProtectionConfig(key, {
      source: "ui/admin-configuracoes",
      technicalContext: {
        panel: "admin",
      },
      value: typeof value === "string" ? value : "",
    });
    revalidatePath("/admin/configuracoes");
  }

  return <AdminSettingsPageBody updateConfig={updateConfig} />;
}

async function AdminSettingsPageBody({
  updateConfig,
}: {
  updateConfig: (key: string, formData: FormData) => Promise<void>;
}) {
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/configuracoes");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  let entries: AdminAnalysisConfigEntry[];

  try {
    const response = await listAnalysisProtectionConfigs();
    entries = response.entries;
  } catch {
    const state = buildAdminStateModel(
      "unexpected-error",
      "/admin/configuracoes",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const riskColors: Record<string, string> = {
    high: AT.danger,
    medium: AT.warn,
    low: AT.muted2,
  };

  return (
    <AdminPageWrap maxWidth={1100}>
      <AdminShellHeader
        eyebrow="admin · configurações"
        subtitle="Ajuste guardrails de proteção sem alterar UX pública. Valores de risco alto afetam usuários em produção."
        title="Configurações."
      />

      {/* Aviso */}
      <div
        style={{
          background: AT.warnBg,
          border: "1px solid rgba(138,96,20,0.20)",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12.5,
          color: "#5a4012",
        }}
      >
        <span
          style={{
            fontFamily: '"Geist Mono", monospace',
            fontSize: 10,
            letterSpacing: 1,
            fontWeight: 600,
            background: "rgba(138,96,20,0.18)",
            padding: "2px 7px",
            borderRadius: 3,
          }}
        >
          ATENÇÃO
        </span>
        Alterações em configs de risco <strong>high</strong> afetam usuários em
        produção. Confirme com o time antes de salvar.
      </div>

      {entries.length === 0 ? (
        <EmptyState
          description="Nenhuma configuração de proteção encontrada no catálogo runtime."
          title="Sem configurações"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((entry) => (
            <div
              key={entry.key}
              style={{
                background: AT.card,
                border: `1px solid ${AT.border}`,
                borderRadius: 10,
                padding: "16px 18px",
              }}
            >
              {/* Linha 1: key + metadados sutis */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 4,
                  flexWrap: "wrap",
                }}
              >
                <code
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 13.5,
                    color: AT.ink2,
                    fontWeight: 600,
                  }}
                >
                  {entry.key}
                </code>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 10.5,
                    color: AT.muted2,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: riskColors[entry.risk] ?? AT.muted2,
                      display: "inline-block",
                    }}
                  />
                  <span>risco</span>
                  <span
                    style={{
                      color: riskColors[entry.risk] ?? AT.muted2,
                      fontWeight: 600,
                    }}
                  >
                    {entry.risk}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 10.5,
                    color: AT.muted2,
                  }}
                >
                  origem{" "}
                  <span style={{ color: AT.ink2, fontWeight: 600 }}>
                    {entry.origin}
                  </span>
                </span>
                <span
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 10.5,
                    color: AT.muted2,
                  }}
                >
                  tipo{" "}
                  <span style={{ color: AT.ink2, fontWeight: 600 }}>
                    {entry.type}
                  </span>
                </span>
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: AT.muted,
                  lineHeight: 1.5,
                  marginBottom: 10,
                }}
              >
                {entry.impactDescription}
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 24,
                  fontSize: 11.5,
                  fontFamily: '"Geist Mono", monospace',
                  color: AT.muted2,
                  marginBottom: 12,
                }}
              >
                <span>
                  default:{" "}
                  <span style={{ color: AT.ink2, fontWeight: 600 }}>
                    {formatDefaultValue(entry)}
                  </span>
                </span>
                <span>
                  range:{" "}
                  <span style={{ color: AT.ink2, fontWeight: 600 }}>
                    {entry.min !== undefined || entry.max !== undefined
                      ? `${entry.min ?? "-"} .. ${entry.max ?? "-"}`
                      : "n/a"}
                  </span>
                </span>
                {entry.values ? (
                  <span>
                    valores:{" "}
                    <span style={{ color: AT.ink2, fontWeight: 600 }}>
                      {entry.values.join(", ")}
                    </span>
                  </span>
                ) : null}
              </div>

              <form
                action={updateConfig.bind(null, entry.key)}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                {entry.type === "enum" && entry.values ? (
                  <select
                    className="h-9 rounded-md border px-3 text-[13px]"
                    style={{
                      borderColor: AT.border,
                      background: AT.bg,
                      color: AT.ink2,
                      fontFamily: '"Geist Mono", monospace',
                      maxWidth: 420,
                      flex: 1,
                    }}
                    defaultValue={formatEditableValue(entry)}
                    name="value"
                  >
                    {entry.values.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                ) : entry.type === "boolean" ? (
                  <select
                    className="h-9 rounded-md border px-3 text-[13px]"
                    style={{
                      borderColor: AT.border,
                      background: AT.bg,
                      color: AT.ink2,
                      fontFamily: '"Geist Mono", monospace',
                      maxWidth: 420,
                      flex: 1,
                    }}
                    defaultValue={formatEditableValue(entry)}
                    name="value"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <div style={{ flex: 1, maxWidth: 420 }}>
                    <Input
                      defaultValue={formatEditableValue(entry)}
                      name="value"
                      placeholder="Novo valor"
                      type={entry.type === "int" ? "number" : "text"}
                    />
                  </div>
                )}
                <button className={buttonVariants()} type="submit">
                  Salvar
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </AdminPageWrap>
  );
}
