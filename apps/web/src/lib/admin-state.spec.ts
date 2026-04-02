import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAdminStateModel } from "./admin-state";

test("buildAdminStateModel returns restricted access copy for missing-role", () => {
  assert.deepEqual(buildAdminStateModel("missing-role", "/admin/empresas"), {
    actionHref: "/backoffice/session/reset?next=%2Fadmin%2Fingestion",
    actionLabel: "Voltar ao ponto de entrada",
    description:
      "A sessao atual e valida, mas nao possui permissao de admin ou superadmin para abrir este modulo.",
    title: "Acesso restrito",
  });
});

test("buildAdminStateModel returns a reset-session action for invalid token", () => {
  assert.deepEqual(buildAdminStateModel("invalid-token", "/admin/usuarios"), {
    actionHref: "/backoffice/session/reset?next=%2Fadmin%2Fingestion",
    actionLabel: "Informar novo token",
    description:
      "O token informado e invalido ou expirou. Gere um novo access token para voltar a acessar o admin.",
    title: "Token invalido",
  });
});

test("buildAdminStateModel returns retry copy for unexpected errors", () => {
  assert.deepEqual(buildAdminStateModel("unexpected-error", "/admin/runs"), {
    actionHref: "/admin/runs",
    actionLabel: "Tentar novamente",
    description:
      "Nao foi possivel carregar esta area agora. Verifique a disponibilidade da API ou tente novamente com a sessao atual.",
    title: "Falha temporaria",
  });
});
