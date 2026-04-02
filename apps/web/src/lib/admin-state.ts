import { buildBackofficeSessionResetHref } from "./backoffice-session";

export type AdminStateKind =
  | "invalid-token"
  | "missing-role"
  | "missing-token"
  | "unexpected-error";

export type AdminStateModel = {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  title: string;
};

export function buildAdminStateModel(
  kind: AdminStateKind,
  currentPath: string,
): AdminStateModel {
  if (kind === "missing-token") {
    return {
      description:
        "Entre com um access token valido para abrir o backoffice operacional da EarlyCV.",
      title: "Token ausente",
    };
  }

  if (kind === "invalid-token") {
    return {
      actionHref: buildBackofficeSessionResetHref("/admin/ingestion"),
      actionLabel: "Informar novo token",
      description:
        "O token informado e invalido ou expirou. Gere um novo access token para voltar a acessar o admin.",
      title: "Token invalido",
    };
  }

  if (kind === "missing-role") {
    return {
      actionHref: buildBackofficeSessionResetHref("/admin/ingestion"),
      actionLabel: "Voltar ao ponto de entrada",
      description:
        "A sessao atual e valida, mas nao possui permissao de admin ou superadmin para abrir este modulo.",
      title: "Acesso restrito",
    };
  }

  return {
    actionHref: currentPath,
    actionLabel: "Tentar novamente",
    description:
      "Nao foi possivel carregar esta area agora. Verifique a disponibilidade da API ou tente novamente com a sessao atual.",
    title: "Falha temporaria",
  };
}
