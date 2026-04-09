import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { listCvAdaptations } from "@/lib/cv-adaptation-api";
import { getMyPlan } from "@/lib/plans-api";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Dashboard | EarlyCV",
};

const PLAN_LABELS: Record<string, string> = {
  free: "Plano gratuito",
  starter: "1 CV otimizado",
  pro: "5 CVs otimizados",
  unlimited: "Uso ilimitado",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type DashboardPageProps = {
  searchParams: Promise<{ plan?: string }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/dashboard", user);
  if (redirectPath) redirect(redirectPath);

  if (!user) redirect(getDefaultAppRedirectPath(null));

  const params = await searchParams;
  const showPlanActivated = params.plan === "activated";

  const [plan, adaptations] = await Promise.allSettled([
    getMyPlan(),
    listCvAdaptations(1, 20),
  ]);

  const planInfo = plan.status === "fulfilled" ? plan.value : null;
  const adaptationList =
    adaptations.status === "fulfilled" ? adaptations.value.items : [];

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#111111]">
      <header className="flex items-center justify-between px-10 py-6">
        <a
          href="/"
          style={{ color: "#111111" }}
          className="font-logo text-2xl tracking-tight"
        >
          earlyCV
        </a>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            className="text-sm text-[#666666] transition-colors hover:text-[#111111]"
          >
            Sair
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-[860px] space-y-4 px-6 pb-20 pt-4">
        {showPlanActivated && (
          <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-5 py-3">
            <span className="text-lime-600">✔</span>
            <p className="text-sm font-semibold text-lime-800">
              Plano ativado com sucesso!
            </p>
          </div>
        )}

        {/* Saudação */}
        <div className="px-1 pt-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Olá, {user.name.split(" ")[0]}
          </h1>
        </div>

        {/* Plano atual */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
            Plano atual
          </p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xl font-bold text-[#111111]">
                {planInfo
                  ? (PLAN_LABELS[planInfo.planType] ?? planInfo.planType)
                  : "—"}
              </p>
              {planInfo?.creditsRemaining !== null &&
                planInfo?.creditsRemaining !== undefined && (
                  <p className="mt-1 text-sm text-[#666666]">
                    {planInfo.creditsRemaining}{" "}
                    {planInfo.creditsRemaining === 1
                      ? "crédito restante"
                      : "créditos restantes"}
                  </p>
                )}
              {planInfo?.creditsRemaining === null && (
                <p className="mt-1 text-sm text-[#666666]">
                  Ilimitado
                  {planInfo.planExpiresAt &&
                    ` até ${formatDate(planInfo.planExpiresAt)}`}
                </p>
              )}
            </div>
            <a
              href="/planos"
              style={{ color: "#ffffff" }}
              className="shrink-0 rounded-[10px] bg-[#111111] px-4 py-2 text-sm font-medium"
            >
              {planInfo?.isActive ? "Upgrade" : "Ver planos"}
            </a>
          </div>
        </div>

        {/* Histórico de análises */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#F2F2F2] px-6 py-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
              Histórico de análises
            </p>
            <a
              href="/adaptar"
              style={{ color: "#ffffff" }}
              className="rounded-[10px] bg-[#111111] px-4 py-2 text-sm font-medium"
            >
              Analisar nova vaga
            </a>
          </div>

          {adaptationList.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-base font-medium text-[#111111]">
                Nenhuma análise ainda
              </p>
              <p className="text-sm text-[#666666]">
                Envie seu CV e a descrição de uma vaga para começar.
              </p>
              <a
                href="/adaptar"
                style={{ color: "#ffffff" }}
                className="mt-2 rounded-[14px] bg-[#111111] px-6 py-3 text-sm font-medium"
              >
                Analisar meu CV
              </a>
            </div>
          ) : (
            <ul className="divide-y divide-[#F2F2F2]">
              {adaptationList.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#111111]">
                      {item.jobTitle ?? "Vaga sem título"}{" "}
                      {item.companyName && (
                        <span className="text-[#666666]">
                          · {item.companyName}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-[#AAAAAA]">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      item.paymentStatus === "completed"
                        ? "bg-lime-100 text-lime-800"
                        : "bg-[#F2F2F2] text-[#666666]"
                    }`}
                  >
                    {item.paymentStatus === "completed" ? "Pago" : "Análise"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
