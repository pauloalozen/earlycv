import assert from "node:assert/strict";
import { test } from "node:test";
import { Reflector } from "@nestjs/core";

import { INTERNAL_ROLES_KEY } from "../common/roles.decorator";
import { ForeignJobsCleanupController } from "./foreign-jobs-cleanup.controller";

// Não re-testa RolesGuard (ver common/roles.guard.spec.ts) — só garante que
// o controller que fecha vaga estrangeira de verdade (status="removed",
// não pode ser desfeito) está de fato marcado com
// @InternalRoles("admin", "superadmin"), então qualquer remoção acidental
// do decorator (ex.: durante um refactor) quebra este teste em vez de só
// ser descoberta em produção.
test("ForeignJobsCleanupController requires admin or superadmin internalRole", () => {
  const reflector = new Reflector();

  const roles = reflector.get<string[]>(
    INTERNAL_ROLES_KEY,
    ForeignJobsCleanupController,
  );

  assert.deepEqual(roles, ["admin", "superadmin"]);
});
