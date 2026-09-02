import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import {
  getMonitorAccess,
  getMonitorAlertPreferences,
  getMonitorProfile,
  listMonitorNotifications,
} from "@/lib/monitor-api";
import { getMyPlan } from "@/lib/plans-api";
import { RadarPageShell } from "../radar/page-shell";
import { MonitorView } from "./monitor-view";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Alerta de Vaga Certa | EarlyCV",
};

const GROUP_PAGE_SIZE = 10;

// Alerta de Vaga Certa é 100% autenticado — sem exploração pública, sem
// SEO, sem facetas. Diferente do Radar (guest-first), não tem fallback
// anônimo: sem sessão válida, redireciona pra /entrar (mesmo padrão de
// /vagas-salvas).
export default async function MonitorPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/alerta-vaga-certa", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  // Único lugar do frontend que lê entitlement do Alerta de Vaga Certa —
  // hoje a política de lançamento sempre libera, então isso nunca
  // redireciona na prática. Quando virar feature de assinatura, o bloqueio
  // passa a acontecer só aqui (ex.: renderizar uma tela de upgrade em vez
  // de redirecionar), sem precisar espalhar checks de plano por
  // MonitorView/componentes filhos.
  const access = await getMonitorAccess();
  if (!access.allowed) redirect(getDefaultAppRedirectPath(user));

  const [profile, alertPreference, plan, notifications] = await Promise.all([
    getMonitorProfile(),
    getMonitorAlertPreferences(),
    getMyPlan().catch(() => null),
    listMonitorNotifications(1, GROUP_PAGE_SIZE),
  ]);

  return (
    <RadarPageShell
      userName={user.name}
      userRole={user.internalRole}
      credits={toHeaderAvailableCredits(plan)}
    >
      <MonitorView
        initialNotifications={notifications}
        initialMonitorStatus={notifications.monitorStatus}
        initialProfile={profile}
        initialAlertPreference={alertPreference}
      />
    </RadarPageShell>
  );
}
