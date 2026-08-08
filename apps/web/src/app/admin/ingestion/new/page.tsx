import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card, Input } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { cn } from "@/lib/cn";
import { buildAdminMetadata } from "@/lib/route-metadata";
import {
  createCompanyAndSourceAction,
  createJobSourceAction,
} from "../actions";

export const metadata = buildAdminMetadata("Nova execucao de ingestion");

type SearchParams = Promise<{
  companyId?: string;
  companyName?: string;
  message?: string;
  status?: string;
  step?: string;
  token?: string;
}>;

type NewAdminSourcePageProps = {
  searchParams: SearchParams;
};

const fieldClassName =
  "h-12 w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-950 outline-none transition-colors duration-200 placeholder:text-stone-400 focus-visible:border-stone-500";

function StatusBanner({
  message,
  status,
}: {
  message?: string;
  status?: string;
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-stone-200 bg-stone-50 text-stone-900",
      )}
    >
      {message}
    </div>
  );
}

export default async function NewAdminSourcePage({
  searchParams,
}: NewAdminSourcePageProps) {
  const { companyId, companyName, message, status } = await searchParams;
  const token = await getBackofficeSessionToken();
  const hasExistingCompany = Boolean(companyId);

  if (!token) {
    return (
      <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900 md:px-10">
        <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
          <h1 className="text-2xl font-bold tracking-tight">Token ausente</h1>
          <p className="text-sm leading-7 text-stone-600">
            Volte ao painel principal e informe um `access_token` valido para
            usar o fluxo administrativo.
          </p>
          <Link className={buttonVariants()} href="/admin/ingestion">
            Voltar para o painel
          </Link>
        </Card>
      </main>
    );
  }

  const redirectPath = `/admin/ingestion/new`;

  return (
    <main className="min-h-screen bg-linear-to-b from-stone-50 via-stone-50 to-stone-100 px-6 py-10 text-stone-900 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-stone-400">
              admin / onboarding de fonte
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              {hasExistingCompany
                ? "Nova fonte de vagas"
                : "Cadastrar empresa e fonte"}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-stone-600">
              {hasExistingCompany
                ? "Conecte o portal de vagas dessa empresa e ja deixe a execucao manual pronta com escalonamento definido."
                : "Empresa, tipo de adapter e URL da fonte num unico cadastro — ja sai pronto pra rodar, sem precisar editar depois."}
            </p>
          </div>

          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/admin/ingestion`}
          >
            Voltar para runs
          </Link>
        </div>

        <StatusBanner message={message} status={status} />

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="space-y-6" padding="lg">
            {hasExistingCompany ? (
              <>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-stone-900">
                    Conectar a fonte
                  </h2>
                  <p className="text-sm leading-7 text-stone-600">
                    Empresa: <strong>{companyName ?? "Empresa selecionada"}</strong>.
                    Cadastre a fonte de vagas, configure escalonamento e, se
                    quiser, execute manualmente no mesmo passo.
                  </p>
                </div>

                <form
                  action={createJobSourceAction}
                  className="grid gap-4 md:grid-cols-2"
                >
                  <input name="companyId" type="hidden" value={companyId} />
                  <input
                    name="companyName"
                    type="hidden"
                    value={companyName ?? ""}
                  />
                  <input
                    name="redirectPath"
                    type="hidden"
                    value={redirectPath}
                  />

                  <label
                    className="space-y-2 md:col-span-2"
                    htmlFor="job-source-name"
                  >
                    <span className="text-sm font-semibold text-stone-800">
                      Nome da fonte
                    </span>
                    <Input
                      id="job-source-name"
                      name="sourceName"
                      placeholder="Career Site Principal"
                      required
                    />
                  </label>

                  <label className="space-y-2" htmlFor="job-source-type">
                    <span className="text-sm font-semibold text-stone-800">
                      Tipo de fonte
                    </span>
                    <select
                      className={fieldClassName}
                      defaultValue="gupy"
                      id="job-source-type"
                      name="sourceType"
                    >
                      <option value="gupy">gupy</option>
                      <option value="custom_html">custom_html</option>
                      <option value="custom_api">custom_api</option>
                      <option value="greenhouse">greenhouse</option>
                      <option value="lever">lever</option>
                      <option value="ashby">ashby</option>
                      <option value="inhire">inhire</option>
                      <option value="teamtailor">teamtailor</option>
                      <option value="talentbrew">talentbrew</option>
                      <option value="workday">workday</option>
                      <option value="solides">solides (sem adapter)</option>
                      <option value="pandape">pandape (sem adapter)</option>
                    </select>
                  </label>

                  <label className="space-y-2" htmlFor="job-source-interval">
                    <span className="text-sm font-semibold text-stone-800">
                      Escalonamento de execucao (minutos)
                    </span>
                    <Input
                      defaultValue="30"
                      id="job-source-interval"
                      min={1}
                      name="checkIntervalMinutes"
                      type="number"
                    />
                    <p className="text-xs text-stone-500">
                      Define a cadencia de verificacao automatica para esta
                      fonte.
                    </p>
                  </label>

                  <label
                    className="space-y-2 md:col-span-2"
                    htmlFor="job-source-url"
                  >
                    <span className="text-sm font-semibold text-stone-800">
                      URL da fonte
                    </span>
                    <Input
                      id="job-source-url"
                      name="sourceUrl"
                      placeholder="https://ifood.gupy.io"
                      required
                      type="url"
                    />
                    <p className="text-xs text-stone-500">
                      Pode colar a URL publica que voce encontra navegando —
                      o slug da empresa e extraido automaticamente. gupy:
                      https://[empresa].gupy.io/ · greenhouse:
                      https://job-boards.greenhouse.io/[empresa] · lever:
                      https://jobs.lever.co/[empresa] · ashby:
                      https://jobs.ashbyhq.com/[empresa] · teamtailor:
                      https://[empresa].teamtailor.com · inhire:
                      https://[empresa].inhire.app · talentbrew:
                      https://carreiras.[empresa].com.br · workday:
                      https://[empresa].[instancia].myworkdayjobs.com/[site]
                      (ex: pt-BR/SantanderCareers)
                    </p>
                  </label>

                  <label className="flex items-center gap-3 md:col-span-2">
                    <input
                      className="size-4 accent-stone-700"
                      defaultChecked
                      name="isActive"
                      type="checkbox"
                    />
                    <span className="text-sm font-medium text-stone-700">
                      Fonte ativa para o painel
                    </span>
                  </label>

                  <label className="flex items-center gap-3 md:col-span-2">
                    <input
                      className="size-4 accent-stone-700"
                      defaultChecked
                      name="runAfterCreate"
                      type="checkbox"
                    />
                    <span className="text-sm font-medium text-stone-700">
                      Executar manualmente assim que criar a fonte
                    </span>
                  </label>

                  <div className="flex flex-wrap gap-3 md:col-span-2">
                    <button className={buttonVariants()} type="submit">
                      Criar fonte e voltar ao painel
                    </button>
                    <Link
                      className={buttonVariants({ variant: "outline" })}
                      href={redirectPath}
                    >
                      Criar outra empresa
                    </Link>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-stone-900">
                    Dados da empresa e da fonte
                  </h2>
                  <p className="text-sm leading-7 text-stone-600">
                    Campos obrigatorios: nome, URL do portal de vagas,
                    segmento, nome da fonte, tipo de adapter e URL da fonte.
                    Os demais campos sao opcionais.
                  </p>
                </div>

                <form
                  action={createCompanyAndSourceAction}
                  className="grid gap-4 md:grid-cols-2"
                >
                  <input
                    name="redirectPath"
                    type="hidden"
                    value={redirectPath}
                  />

                  <label
                    className="space-y-2 md:col-span-2"
                    htmlFor="company-name"
                  >
                    <span className="text-sm font-semibold text-stone-800">
                      Nome da empresa
                    </span>
                    <Input
                      id="company-name"
                      name="name"
                      placeholder="Ex.: ACME Labs"
                      required
                    />
                  </label>

                  <label className="space-y-2" htmlFor="company-careers-url">
                    <span className="text-sm font-semibold text-stone-800">
                      URL do portal de vagas
                    </span>
                    <Input
                      id="company-careers-url"
                      name="careersUrl"
                      placeholder="https://empresa.gupy.io"
                      type="url"
                      required
                    />
                  </label>

                  <label className="space-y-2" htmlFor="company-industry">
                    <span className="text-sm font-semibold text-stone-800">
                      Segmento
                    </span>
                    <Input
                      id="company-industry"
                      name="industry"
                      placeholder="Tecnologia"
                      required
                    />
                  </label>

                  <label className="space-y-2" htmlFor="company-website-url">
                    <span className="text-sm font-semibold text-stone-800">
                      Website (opcional)
                    </span>
                    <Input
                      id="company-website-url"
                      name="websiteUrl"
                      placeholder="https://empresa.com"
                      type="url"
                    />
                  </label>

                  <label className="space-y-2" htmlFor="company-linkedin-url">
                    <span className="text-sm font-semibold text-stone-800">
                      LinkedIn (opcional)
                    </span>
                    <Input
                      id="company-linkedin-url"
                      name="linkedinUrl"
                      placeholder="https://www.linkedin.com/company/..."
                      type="url"
                    />
                  </label>

                  <label
                    className="space-y-2"
                    htmlFor="company-country"
                  >
                    <span className="text-sm font-semibold text-stone-800">
                      Pais (opcional)
                    </span>
                    <Input
                      id="company-country"
                      name="country"
                      placeholder="Brasil"
                    />
                  </label>

                  <div className="md:col-span-2 border-t border-stone-200 pt-4">
                    <h3 className="text-sm font-semibold text-stone-800">
                      Primeira fonte de vagas
                    </h3>
                  </div>

                  <label
                    className="space-y-2 md:col-span-2"
                    htmlFor="job-source-name"
                  >
                    <span className="text-sm font-semibold text-stone-800">
                      Nome da fonte
                    </span>
                    <Input
                      id="job-source-name"
                      name="sourceName"
                      placeholder="Career Site Principal"
                      required
                    />
                  </label>

                  <label className="space-y-2" htmlFor="job-source-type">
                    <span className="text-sm font-semibold text-stone-800">
                      Tipo de fonte
                    </span>
                    <select
                      className={fieldClassName}
                      defaultValue="gupy"
                      id="job-source-type"
                      name="sourceType"
                    >
                      <option value="gupy">gupy</option>
                      <option value="custom_html">custom_html</option>
                      <option value="custom_api">custom_api</option>
                      <option value="greenhouse">greenhouse</option>
                      <option value="lever">lever</option>
                      <option value="ashby">ashby</option>
                      <option value="inhire">inhire</option>
                      <option value="teamtailor">teamtailor</option>
                      <option value="talentbrew">talentbrew</option>
                      <option value="workday">workday</option>
                      <option value="solides">solides (sem adapter)</option>
                      <option value="pandape">pandape (sem adapter)</option>
                    </select>
                  </label>

                  <label className="space-y-2" htmlFor="job-source-interval">
                    <span className="text-sm font-semibold text-stone-800">
                      Escalonamento de execucao (minutos)
                    </span>
                    <Input
                      defaultValue="30"
                      id="job-source-interval"
                      min={1}
                      name="checkIntervalMinutes"
                      type="number"
                    />
                    <p className="text-xs text-stone-500">
                      Define a cadencia de verificacao automatica para esta
                      fonte.
                    </p>
                  </label>

                  <label
                    className="space-y-2 md:col-span-2"
                    htmlFor="job-source-url"
                  >
                    <span className="text-sm font-semibold text-stone-800">
                      URL da fonte
                    </span>
                    <Input
                      id="job-source-url"
                      name="sourceUrl"
                      placeholder="https://ifood.gupy.io"
                      required
                      type="url"
                    />
                    <p className="text-xs text-stone-500">
                      Pode colar a URL publica que voce encontra navegando —
                      o slug da empresa e extraido automaticamente. gupy:
                      https://[empresa].gupy.io/ · greenhouse:
                      https://job-boards.greenhouse.io/[empresa] · lever:
                      https://jobs.lever.co/[empresa] · ashby:
                      https://jobs.ashbyhq.com/[empresa] · teamtailor:
                      https://[empresa].teamtailor.com · inhire:
                      https://[empresa].inhire.app · talentbrew:
                      https://carreiras.[empresa].com.br · workday:
                      https://[empresa].[instancia].myworkdayjobs.com/[site]
                      (ex: pt-BR/SantanderCareers)
                    </p>
                  </label>

                  <label className="flex items-center gap-3 md:col-span-2">
                    <input
                      className="size-4 accent-stone-700"
                      defaultChecked
                      name="isActive"
                      type="checkbox"
                    />
                    <span className="text-sm font-medium text-stone-700">
                      Fonte ativa para o painel
                    </span>
                  </label>

                  <label className="flex items-center gap-3 md:col-span-2">
                    <input
                      className="size-4 accent-stone-700"
                      defaultChecked
                      name="runAfterCreate"
                      type="checkbox"
                    />
                    <span className="text-sm font-medium text-stone-700">
                      Executar manualmente assim que criar a fonte
                    </span>
                  </label>

                  <div className="md:col-span-2">
                    <button className={buttonVariants()} type="submit">
                      Criar empresa e fonte
                    </button>
                  </div>
                </form>
              </>
            )}
          </Card>

          <Card className="space-y-5" padding="lg" variant="ghost">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-stone-400">
                como funciona
              </p>
              <h2 className="text-xl font-bold tracking-tight text-stone-900">
                Fluxo assistido para operacao manual
              </h2>
            </div>

            <div className="space-y-4 text-sm leading-7 text-stone-600">
              <p>
                1. O backend cria a empresa e a primeira `job source` num
                unico submit, com parser e estrategia derivados do tipo de
                adapter escolhido.
              </p>
              <p>
                2. Depois do sucesso, voce volta para a tela de runs e pode
                clicar em <strong>Rodar agora</strong> imediatamente.
              </p>
              <p>
                Se a fonte falhar depois da empresa ja criada, voce cai na
                pagina da empresa pra completar so a parte que faltou.
              </p>
            </div>

            {companyId ? (
              <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                Empresa atual: <strong>{companyName ?? companyId}</strong>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </main>
  );
}
