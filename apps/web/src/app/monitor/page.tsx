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
  getMonitorCount,
  getMonitorLevelCounts,
  getMonitorProfile,
  listMonitorRecommendations,
} from "@/lib/monitor-api";
import { getMyPlan } from "@/lib/plans-api";
import { RadarPageShell } from "../radar/page-shell";
import { MonitorView } from "./monitor-view";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Meu Monitor | EarlyCV",
};

const PAGE_SIZE = 4;
const LEVELS_DESC = [5, 4, 3, 2, 1, 0] as const;

// Meu Monitor é 100% autenticado — sem exploração pública, sem SEO, sem
// facetas. Diferente do Radar (guest-first), não tem fallback anônimo: sem
// sessão válida, redireciona pra /entrar (mesmo padrão de /vagas-salvas).
export default async function MonitorPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/monitor", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  // Único lugar do frontend que lê entitlement do Monitor — hoje a
  // política de lançamento sempre libera, então isso nunca redireciona na
  // prática. Quando o Monitor virar feature de assinatura, o bloqueio
  // passa a acontecer só aqui (ex.: renderizar uma tela de upgrade em vez
  // de redirecionar), sem precisar espalhar checks de plano por
  // MonitorView/componentes filhos.
  const access = await getMonitorAccess();
  if (!access.allowed) redirect(getDefaultAppRedirectPath(user));

  const [profile, alertPreference, plan, levelCounts, countInfo] =
    await Promise.all([
      getMonitorProfile(),
      getMonitorAlertPreferences(),
      getMyPlan().catch(() => null),
      getMonitorLevelCounts(),
      getMonitorCount(),
    ]);

  // Cada seção (nível de oportunidade) pagina seus próprios itens de forma
  // independente — só busca a primeira página dos níveis que realmente têm
  // recomendação, em vez de um feed único ordenado.
  const nonEmptyLevels = LEVELS_DESC.filter(
    (level) => (levelCounts[level] ?? 0) > 0,
  );
  const feeds = await Promise.all(
    nonEmptyLevels.map((level) =>
      listMonitorRecommendations(1, PAGE_SIZE, false, level),
    ),
  );
  const initialSections = nonEmptyLevels.map((level, i) => ({
    level,
    items: feeds[i].items,
    total: feeds[i].total,
  }));
  const initialMonitorStatus = countInfo.monitorStatus;

  return (
    <RadarPageShell
      userName={user.name}
      userRole={user.internalRole}
      credits={toHeaderAvailableCredits(plan)}
    >
      <MonitorView
        initialSections={initialSections}
        initialMonitorStatus={initialMonitorStatus}
        initialProfile={profile}
        initialAlertPreference={alertPreference}
      />
    </RadarPageShell>
  );
}
