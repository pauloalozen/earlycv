import "server-only";

import { getBackofficeSessionToken } from "./backoffice-session.server";

export type AdminAffiliatePartner = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  status: "draft" | "active" | "inactive";
  createdAt: string;
  codes: {
    id: string;
    code: string;
    status: string;
    campaign: { id: string; name: string; status: string };
  }[];
};

export type AdminAffiliateCode = {
  id: string;
  code: string;
  status: "draft" | "active" | "inactive";
  partnerId: string;
  partner: { id: string; name: string; slug: string };
};

export type AdminAffiliateCampaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "inactive";
  startsAt: string | null;
  endsAt: string | null;
  eligiblePlanIds: string[];
  defaultDiscountType: "percentage" | "fixed_amount" | null;
  defaultDiscountValue: number | null;
  creditBonusType: "multiplier" | "fixed_extra" | null;
  creditBonusValue: number | null;
  partnershipCostInCents: number | null;
  freeRedemptionPerUserLimit: number;
  freeRedemptionLimitTotal: number | null;
  freeRedemptionsUsed: number;
  codes: AdminAffiliateCode[];
};

export type AdminAffiliateCampaignReport = {
  campaignId: string;
  campaignName: string;
  metrics: {
    visits: { value: number; confidence: string; note: string };
    signups: { value: number; confidence: string; note: string };
    approvedPurchases: { value: number; confidence: string };
    uniqueBuyers: { value: number; confidence: string };
    revenueInCents: { value: number; confidence: string };
    discountGrantedInCents: { value: number; confidence: string };
    bonusCreditsGranted: { value: number; confidence: string };
    freeRedemptionsUsed: {
      value: number;
      total: number | null;
      confidence: string;
    };
    cacPerSignupInCents: { value: number; confidence: string } | null;
    cacPerBuyerInCents: { value: number; confidence: string } | null;
  };
};

function getApiBaseUrl() {
  const url =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return url.endsWith("/api") ? url : `${url}/api`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getBackofficeSessionToken();
  if (!token) throw new Error("Missing backoffice session token.");

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export function listAdminAffiliatePartners() {
  return apiRequest<AdminAffiliatePartner[]>("/admin/affiliates/partners");
}

export function createAdminAffiliatePartner(input: {
  name: string;
  slug: string;
  email?: string;
  status?: "draft" | "active" | "inactive";
}) {
  return apiRequest<AdminAffiliatePartner>("/admin/affiliates/partners", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setAdminAffiliatePartnerStatus(
  id: string,
  status: "draft" | "active" | "inactive",
) {
  return apiRequest<AdminAffiliatePartner>(
    `/admin/affiliates/partners/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export function listAdminAffiliateCampaigns(partnerId?: string) {
  const qs = partnerId ? `?partnerId=${encodeURIComponent(partnerId)}` : "";
  return apiRequest<AdminAffiliateCampaign[]>(
    `/admin/affiliates/campaigns${qs}`,
  );
}

export function createAdminAffiliateCampaign(input: {
  name: string;
  status?: "draft" | "active" | "inactive";
  startsAt?: string;
  endsAt?: string;
  eligiblePlanIds: string[];
  defaultDiscountType?: "percentage" | "fixed_amount";
  defaultDiscountValue?: number;
  creditBonusType?: "multiplier" | "fixed_extra";
  creditBonusValue?: number;
  partnershipCostInCents?: number;
  freeRedemptionPerUserLimit?: number;
  freeRedemptionLimitTotal?: number;
}) {
  return apiRequest<AdminAffiliateCampaign>("/admin/affiliates/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setAdminAffiliateCampaignStatus(
  id: string,
  status: "draft" | "active" | "inactive",
) {
  return apiRequest<AdminAffiliateCampaign>(
    `/admin/affiliates/campaigns/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export function getAdminAffiliateCampaignReport(campaignId: string) {
  return apiRequest<AdminAffiliateCampaignReport>(
    `/admin/affiliates/campaigns/${campaignId}/report`,
  );
}

export function createAdminAffiliateCode(input: {
  campaignId: string;
  partnerId: string;
  code: string;
  landingPageUrl?: string;
  status?: "draft" | "active" | "inactive";
}) {
  return apiRequest<AdminAffiliateCode>("/admin/affiliates/codes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setAdminAffiliateCodeStatus(
  id: string,
  status: "draft" | "active" | "inactive",
) {
  return apiRequest<AdminAffiliateCode>(
    `/admin/affiliates/codes/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}
