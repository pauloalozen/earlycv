"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
import { PageShell } from "@/components/page-shell";

export default function PagamentoFalhou() {
  const retryHref = "/planos";

  return (
    <PageShell>
      <AuthMonoShell>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
            <svg
              aria-hidden="true"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Pagamento não aprovado
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            O pagamento foi recusado ou expirou. Tente novamente.
          </p>

          <Link
            href={retryHref}
            style={{ color: "#ffffff" }}
            className="block w-full rounded-[14px] bg-[#111111] py-[16px] text-base font-medium leading-none text-center transition-colors hover:bg-[#222222] mb-4"
          >
            Tentar novamente
          </Link>

          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Voltar para análise e tentar depois
          </Link>
        </div>
      </AuthMonoShell>
    </PageShell>
  );
}
