import { revalidatePath } from "next/cache";
import Link from "next/link";

import {
  Badge,
  buttonVariants,
  Card,
  EmptyState,
  Input,
} from "@/components/ui";
import {
  type AdminAnalysisConfigEntry,
  listAnalysisProtectionConfigs,
  updateAnalysisProtectionConfig,
} from "@/lib/admin-analysis-config-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { SuperadminShellHeader } from "../_components/superadmin-shell-header";
import { SuperadminState } from "../_components/superadmin-state";

type SuperadminSettingsPageProps = {
  searchParams: Promise<{ token?: string }>;
};

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

export default async function SuperadminSettingsPage({
  searchParams,
}: SuperadminSettingsPageProps) {
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin/configuracoes"
          kind="missing-token"
        />
      </div>
    );
  }

  async function updateConfig(key: string, formData: FormData) {
    "use server";
    const value = formData.get("value");

    await updateAnalysisProtectionConfig(key, {
      source: "ui/superadmin-configuracoes",
      technicalContext: {
        panel: "superadmin",
      },
      value: typeof value === "string" ? value : "",
    });
    revalidatePath("/superadmin/configuracoes");
  }

  let entries: AdminAnalysisConfigEntry[];

  try {
    const response = await listAnalysisProtectionConfigs(token);
    entries = response.entries;
  } catch {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin/configuracoes"
          kind="unexpected-error"
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <SuperadminShellHeader
          actions={
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/superadmin/equipe`}
            >
              Ver equipe
            </Link>
          }
          eyebrow="superadmin / configuracoes"
          subtitle="Governanca runtime da protecao de analise com origem efetiva, risco e impacto operacional."
          title="Configuracoes e templates"
        />

        {entries.length === 0 ? (
          <EmptyState
            description="Nenhuma configuracao de protection encontrada no catalogo runtime."
            title="Sem configuracoes"
          />
        ) : (
          <div className="grid gap-4">
            {entries.map((entry) => (
              <Card className="space-y-4" key={entry.key}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-stone-500">
                      {entry.key}
                    </p>
                    <p className="text-sm text-stone-600">
                      {entry.impactDescription}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={entry.risk === "high" ? "neutral" : "accent"}
                    >
                      risco {entry.risk}
                    </Badge>
                    <Badge variant="neutral">origem {entry.origin}</Badge>
                    <Badge variant="neutral">tipo {entry.type}</Badge>
                  </div>
                </div>

                <div className="grid gap-2 text-sm text-stone-600 md:grid-cols-3">
                  <p>
                    <strong>Default:</strong> {formatDefaultValue(entry)}
                  </p>
                  <p>
                    <strong>Range:</strong>{" "}
                    {entry.min !== undefined || entry.max !== undefined
                      ? `${entry.min ?? "-"} .. ${entry.max ?? "-"}`
                      : "n/a"}
                  </p>
                  {entry.values ? (
                    <p>
                      <strong>Valores:</strong> {entry.values.join(", ")}
                    </p>
                  ) : null}
                </div>

                <form
                  action={updateConfig.bind(null, entry.key)}
                  className="grid gap-3 md:grid-cols-[1fr_auto]"
                >
                  {entry.type === "enum" && entry.values ? (
                    <select
                      className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
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
                      className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
                      defaultValue={formatEditableValue(entry)}
                      name="value"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <Input
                      defaultValue={formatEditableValue(entry)}
                      name="value"
                      placeholder="Novo valor"
                      type={entry.type === "int" ? "number" : "text"}
                    />
                  )}
                  <button
                    className={buttonVariants({ variant: "outline" })}
                    type="submit"
                  >
                    Salvar
                  </button>
                </form>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
