import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSuperadminStateModel } from "./superadmin-state";

test("buildSuperadminStateModel resets the stale session before returning to superadmin", () => {
  assert.deepEqual(
    buildSuperadminStateModel("invalid-token", "/superadmin/equipe"),
    {
      actionHref: "/backoffice/session/reset?next=%2Fsuperadmin",
      actionLabel: "Abrir ponto de entrada",
      description:
        "O token informado e invalido ou expirou. Gere um novo access token para voltar a acessar a camada institucional.",
      title: "Token invalido",
    },
  );
});
