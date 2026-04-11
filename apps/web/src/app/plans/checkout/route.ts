import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { createPlanCheckout } from "@/lib/plans-api";
import { createPostRedirectResponse } from "@/lib/route-response";

const VALID_PLAN_IDS = ["starter", "pro", "turbo"] as const;
type PlanId = (typeof VALID_PLAN_IDS)[number];

const PLAN_LINKS: Record<PlanId, string | undefined> = {
  starter: process.env.LINK_PLAN_STARTER,
  pro: process.env.LINK_PLAN_PRO,
  turbo: process.env.LINK_PLAN_TURBO,
};

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

  // Use pre-configured MP link if available
  const directLink = PLAN_LINKS[planId];
  if (directLink) {
    return Response.redirect(directLink, 303);
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
