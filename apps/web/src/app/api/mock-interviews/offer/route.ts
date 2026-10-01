import { NextResponse } from "next/server";

import { fetchMockInterviewOffer } from "@/lib/mock-interview-offer.server";

export const revalidate = 300;

// Preço público para componentes de cliente (vitrine da landing principal).
export async function GET() {
  const offer = await fetchMockInterviewOffer();
  return NextResponse.json(offer ?? { amountInCents: null });
}
