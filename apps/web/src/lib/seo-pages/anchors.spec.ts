import assert from "node:assert/strict";
import { test } from "node:test";

import { toAreaAnchorId } from "./anchors";

test("slugifies area names for stable anchors", () => {
  assert.equal(toAreaAnchorId("Dados e BI"), "dados-e-bi");
  assert.equal(toAreaAnchorId("Gestão/Liderança"), "gestao-lideranca");
  assert.equal(
    toAreaAnchorId("Atendimento ao cliente"),
    "atendimento-ao-cliente",
  );
});
