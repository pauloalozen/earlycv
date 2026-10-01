// Navegação da aba única "Emails" do admin: reúne, numa só guia do topo, as
// abas que já existiam (Alerta de Vagas, Product Updates, Recuperação de
// pagamento — mantêm suas rotas) e as telas novas do dispatch (visão geral,
// relacionamento, compras, templates, supressões, configurações). Sem
// "server-only": é usada pelo topbar e pela sub-navegação (client) e pelos
// testes.

export type EmailsTabId =
  | "visao-geral"
  | "alerta-vagas"
  | "product-updates"
  | "recuperacao"
  | "relacionamento"
  | "compras"
  | "templates"
  | "supressoes"
  | "configuracoes";

export type EmailsTab = {
  id: EmailsTabId;
  label: string;
  href: string;
  // Só casa o caminho exato (a "Visão geral" é prefixo de todas as outras).
  exact?: boolean;
};

export const EMAILS_ROOT = "/admin/emails";

export const EMAILS_TABS: readonly EmailsTab[] = [
  { id: "visao-geral", label: "Visão geral", href: EMAILS_ROOT, exact: true },
  { id: "alerta-vagas", label: "Alerta de Vagas", href: "/admin/alerta-vagas" },
  {
    id: "product-updates",
    label: "Product Updates",
    href: "/admin/product-updates",
  },
  {
    id: "recuperacao",
    label: "Recuperação de pagamento",
    href: "/admin/payment-recovery",
  },
  {
    id: "relacionamento",
    label: "Relacionamento",
    href: `${EMAILS_ROOT}/relacionamento`,
  },
  { id: "compras", label: "Compras", href: `${EMAILS_ROOT}/compras` },
  { id: "templates", label: "Templates", href: `${EMAILS_ROOT}/templates` },
  { id: "supressoes", label: "Supressões", href: `${EMAILS_ROOT}/supressoes` },
  {
    id: "configuracoes",
    label: "Configurações",
    href: `${EMAILS_ROOT}/configuracoes`,
  },
] as const;

function matches(pathname: string, tab: EmailsTab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

// Aba ativa para um caminho (null fora da área de e-mails). O detalhe de um
// envio (/admin/emails/envios/:id) não tem aba própria: fica em
// "Relacionamento" (o link "voltar" da própria tela leva à lista certa).
export function resolveActiveEmailsTab(pathname: string): EmailsTabId | null {
  if (
    pathname === `${EMAILS_ROOT}/envios` ||
    pathname.startsWith(`${EMAILS_ROOT}/envios/`)
  ) {
    return "relacionamento";
  }
  return EMAILS_TABS.find((tab) => matches(pathname, tab))?.id ?? null;
}

// O item "Emails" do topo fica ativo em QUALQUER tela da área.
export function isEmailsRoute(pathname: string): boolean {
  return resolveActiveEmailsTab(pathname) !== null;
}
