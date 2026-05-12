import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { createPlanCheckout } from "@/lib/plans-api";
import { createPostRedirectResponse } from "@/lib/route-response";

const VALID_PLAN_IDS = ["starter", "pro", "turbo"] as const;
type PlanId = (typeof VALID_PLAN_IDS)[number];

function isPlanId(value: string): value is PlanId {
  return VALID_PLAN_IDS.includes(value as PlanId);
}

function loginRedirectPath(planId: PlanId): string {
  const next = encodeURIComponent(`/plans/checkout?plan=${planId}`);
  return `/entrar?next=${next}`;
}

async function createCheckoutRedirect(
  requestUrl: string,
  planId: PlanId,
  adaptationId?: string,
) {
  try {
    const checkout = await createPlanCheckout(planId, adaptationId);

    if (checkout.checkoutMode === "brick") {
      return Response.redirect(
        new URL(`/pagamento/checkout/${checkout.purchaseId}`, requestUrl),
        303,
      );
    }

    return Response.redirect(checkout.checkoutUrl, 303);
  } catch {
    return createPostRedirectResponse(requestUrl, "/planos?error=checkout-failed");
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const planId = String(url.searchParams.get("plan") ?? "").trim();

  if (!isPlanId(planId)) {
    return createPostRedirectResponse(request.url, "/planos?error=plano-invalido");
  }

  const user = await getCurrentAppUserFromCookies();
  if (!user) {
    return createPostRedirectResponse(request.url, loginRedirectPath(planId));
  }

  return createCheckoutRedirect(request.url, planId);
}

export async function POST(request: Request) {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return createPostRedirectResponse(request.url, "/entrar?next=/planos");
  }

  const formData = await request.formData();
  const planId = String(formData.get("planId") ?? "").trim();
  const rawAdaptationId = String(formData.get("adaptationId") ?? "").trim();
  const adaptationId = rawAdaptationId.length > 0 ? rawAdaptationId : undefined;

  if (!isPlanId(planId)) {
    return createPostRedirectResponse(
      request.url,
      "/planos?error=plano-invalido",
    );
  }

  return createCheckoutRedirect(request.url, planId, adaptationId);
}
