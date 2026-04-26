"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { PageShell } from "@/components/page-shell";

// This page is kept for backward compatibility with checkouts created before
// the /pagamento/* pages were introduced. New checkouts redirect directly to
// /pagamento/concluido via back_urls in the MP preference.
export default function ConfirmacaoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  useEffect(() => {
    const collectionStatus = searchParams.get("collection_status");
    const status = searchParams.get("status");
    const mpStatus = collectionStatus ?? status;

    const checkoutId = params.id;

    if (mpStatus === "rejected" || mpStatus === "cancelled") {
      router.replace(`/pagamento/falhou?checkoutId=${checkoutId}`);
    } else if (mpStatus === "pending" || mpStatus === "in_process") {
      router.replace(`/pagamento/pendente?checkoutId=${checkoutId}`);
    } else {
      router.replace(`/pagamento/concluido?checkoutId=${checkoutId}`);
    }
  }, [params.id, router, searchParams]);

  return (
    <PageShell>
      <main className="min-h-screen bg-[#F2F2F2] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111] mx-auto" />
        </div>
      </main>
    </PageShell>
  );
}
