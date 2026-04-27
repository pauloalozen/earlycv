"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { reconcilePaymentAction } from "../_actions/reconcile";

export function ReconcileButton({ checkoutId }: { checkoutId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  const handleReconcile = async () => {
    setLoading(true);
    setResult(null);
    try {
      const data = await reconcilePaymentAction(checkoutId);
      setResult(data.message);
      if (data.reconciled) router.refresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Erro ao reconciliar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleReconcile}
        disabled={loading}
        className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-50"
      >
        {loading ? "Verificando MP..." : "Forçar reconciliação"}
      </button>
      {result && <p className="text-sm text-stone-600">{result}</p>}
    </div>
  );
}
