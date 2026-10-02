import type { AppSessionUser } from "@/lib/app-session";

/**
 * Feature flag da Entrevista Simulada no web (NEXT_PUBLIC_MOCK_INTERVIEW_MODE):
 *  - off   -> landing, compra e oferta somem (padrão; ausente/inválido = off);
 *  - admin -> só staff admin/superadmin vê e compra; nada público
 *             (vitrine, menus, rodapé, sitemap) aparece;
 *  - on    -> aberta a todos.
 *
 * Aqui só controla o que aparece. O gate real é a API (MOCK_INTERVIEW_MODE),
 * que recusa oferta, checkout e pagamento. As duas precisam do mesmo valor.
 * Por ser NEXT_PUBLIC, mudar o valor exige novo deploy do web.
 */
export type MockInterviewMode = "off" | "admin" | "on";

export function getMockInterviewMode(): MockInterviewMode {
  const raw = process.env.NEXT_PUBLIC_MOCK_INTERVIEW_MODE?.trim().toLowerCase();
  return raw === "on" || raw === "admin" ? raw : "off";
}

// Superfícies públicas (vitrine, menus, rodapé, sitemap, links de SEO).
export function isMockInterviewPublic(): boolean {
  return getMockInterviewMode() === "on";
}

export function canAccessMockInterview(
  user: Pick<AppSessionUser, "isStaff" | "internalRole"> | null | undefined,
  mode: MockInterviewMode = getMockInterviewMode(),
): boolean {
  if (mode === "on") return true;
  if (mode === "off" || !user) return false;
  return (
    user.isStaff &&
    (user.internalRole === "admin" || user.internalRole === "superadmin")
  );
}
