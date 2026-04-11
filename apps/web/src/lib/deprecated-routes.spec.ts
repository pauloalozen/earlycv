import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

test("deprecated route pages are removed", () => {
  const removedRoutes = [
    "../app/adaptar/[id]/checkout/page.tsx",
    "../app/adaptar/[id]/resultado/page.tsx",
    "../app/ui/page.tsx",
  ];

  for (const routePath of removedRoutes) {
    const absolutePath = resolve(currentDir, routePath);
    assert.equal(
      existsSync(absolutePath),
      false,
      `${routePath} should be removed`,
    );
  }
});
