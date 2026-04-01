import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSuperadminStateModel } from "./superadmin-state.ts";

test("buildSuperadminStateModel omits the CTA for missing-token", () => {
  assert.deepEqual(buildSuperadminStateModel("missing-token", "/superadmin"), {
    description:
      "Entre com um access token valido para abrir a camada institucional e navegar pelos modulos de superadmin.",
    title: "Token ausente",
  });
});

test("buildSuperadminStateModel sends invalid-token users to the entry point", () => {
  assert.deepEqual(
    buildSuperadminStateModel("invalid-token", "/superadmin/equipe"),
    {
      actionHref: "/superadmin",
      actionLabel: "Abrir ponto de entrada",
      description:
        "O token informado e invalido ou expirou. Gere um novo access token para voltar a acessar a camada institucional.",
      title: "Token invalido",
    },
  );
});

test("buildSuperadminStateModel retries the same route on unexpected errors", () => {
  assert.deepEqual(
    buildSuperadminStateModel("unexpected-error", "/superadmin/equipe/staff_1"),
    {
      actionHref: "/superadmin/equipe/staff_1",
      actionLabel: "Tentar novamente",
      description:
        "Nao foi possivel carregar esta area agora. Verifique a disponibilidade da API ou tente novamente em instantes com a sessao atual.",
      title: "Falha temporaria",
    },
  );
});
