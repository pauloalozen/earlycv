import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPlanCatalog } from "./plan-catalog.ts";

test("buildPlanCatalog includes free plan and analysis quantities for all plans", () => {
  const plans = buildPlanCatalog({
    QNT_AN_PLAN_FREE: "3",
    QNT_AN_PLAN_STARTER: "6",
    QNT_AN_PLAN_PRO: "9",
    QNT_AN_PLAN_TURBO: "30",
    QNT_CV_PLAN_STARTER: "1",
    QNT_CV_PLAN_PRO: "3",
    QNT_CV_PLAN_TURBO: "10",
    PRICE_PLAN_STARTER: "1190",
    PRICE_PLAN_PRO: "2990",
    PRICE_PLAN_TURBO: "5990",
  });

  assert.equal(plans.length, 4);
  assert.equal(plans[0]?.id, "free");
  assert.equal(
    plans[0]?.features.some((feature) => feature.includes("3 análises")),
    true,
  );

  const starter = plans.find((plan) => plan.id === "starter");
  const pro = plans.find((plan) => plan.id === "pro");
  const turbo = plans.find((plan) => plan.id === "turbo");

  assert.equal(
    starter?.features.some((feature) => feature.includes("6 análises")),
    true,
  );
  assert.equal(
    pro?.features.some((feature) => feature.includes("9 análises")),
    true,
  );
  assert.equal(
    turbo?.features.some((feature) => feature.includes("30 análises")),
    true,
  );
});
