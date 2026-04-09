import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { createPlanCheckout } from "@/lib/plans-api";
import { createPostRedirectResponse } from "@/lib/route-response";

const VALID_PLAN_IDS = ["starter", "pro", "unlimited"] as const;
type PlanId = (typeof VALID_PLAN_IDS)[number];

function isPlanId(value: string): value is PlanId {
  return VALID_PLAN_IDS.includes(value as PlanId);
}

export async function POST(request: Request) {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return createPostRedirectResponse(request.url, "/entrar?next=/planos");
  }

  const formData = await request.formData();
  const planId = String(formData.get("planId") ?? "").trim();

  if (!isPlanId(planId)) {
    return createPostRedirectResponse(
      request.url,
      "/planos?error=plano-invalido",
    );
  }

  try {
    const { checkoutUrl } = await createPlanCheckout(planId);
    return Response.redirect(checkoutUrl, 303);
  } catch {
    return createPostRedirectResponse(
      request.url,
      "/planos?error=checkout-failed",
    );
  }
}
