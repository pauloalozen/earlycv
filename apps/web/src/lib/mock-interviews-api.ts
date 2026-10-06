import "server-only";

import { apiRequest } from "./api-request";
import type { MockInterviewPurchaseView } from "./mock-interviews-types";

export async function listMyMockInterviews(): Promise<
  MockInterviewPurchaseView[]
> {
  const response = await apiRequest("GET", "/mock-interviews/purchases");
  if (!response.ok) throw new Error("Failed to fetch mock interviews");
  return (await response.json()) as MockInterviewPurchaseView[];
}

// null = pedido inexistente ou de outro usuário.
export async function getMyMockInterview(
  id: string,
  options: { refresh?: boolean } = {},
): Promise<MockInterviewPurchaseView | null> {
  const response = await apiRequest(
    "GET",
    `/mock-interviews/purchases/${encodeURIComponent(id)}${options.refresh ? "?refresh=true" : ""}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Failed to fetch mock interview");
  return (await response.json()) as MockInterviewPurchaseView;
}
