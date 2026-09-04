import assert from "node:assert/strict";
import { test } from "node:test";
import { Reflector } from "@nestjs/core";

import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { AdminMonitorController } from "./admin-monitor.controller";

// Não re-testa RolesGuard (ver common/roles.guard.spec.ts) — só garante que
// o controller do painel de diagnóstico do Monitor está de fato marcado com
// @InternalRoles("admin", "superadmin"), então qualquer remoção acidental do
// decorator (ex.: durante um refactor) quebra este teste em vez de só ser
// descoberta em produção.
test("AdminMonitorController requires admin or superadmin internalRole", () => {
  const reflector = new Reflector();

  const roles = reflector.get<string[]>(
    INTERNAL_ROLES_KEY,
    AdminMonitorController,
  );

  assert.deepEqual(roles, ["admin", "superadmin"]);
});
