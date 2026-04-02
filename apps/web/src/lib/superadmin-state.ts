import { buildBackofficeSessionResetHref } from "./backoffice-session";

export type SuperadminStateKind =
  | "invalid-token"
  | "missing-token"
  | "unexpected-error";

export type SuperadminStateModel = {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  title: string;
};

export function buildSuperadminStateModel(
  kind: SuperadminStateKind,
  currentPath: string,
): SuperadminStateModel {
  if (kind === "missing-token") {
    return {
      description:
        "Entre com um access token valido para abrir a camada institucional e navegar pelos modulos de superadmin.",
      title: "Token ausente",
    };
  }

  if (kind === "invalid-token") {
    return {
      actionHref: buildBackofficeSessionResetHref("/superadmin"),
      actionLabel: "Abrir ponto de entrada",
      description:
        "O token informado e invalido ou expirou. Gere um novo access token para voltar a acessar a camada institucional.",
      title: "Token invalido",
    };
  }

  return {
    actionHref: currentPath,
    actionLabel: "Tentar novamente",
    description:
      "Nao foi possivel carregar esta area agora. Verifique a disponibilidade da API ou tente novamente em instantes com a sessao atual.",
    title: "Falha temporaria",
  };
}
