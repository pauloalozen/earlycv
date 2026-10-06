"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MOCK_INTERVIEW_OFFER } from "@/lib/mock-interview-offer";

// CTA de compra da landing. A landing é estática (SEO); a origem da visita
// (?origem=email|candidatura|vitrine e ?candidatura=<id>) é lida no
// navegador e repassada para o checkout, que a registra na compra.
export function CheckoutLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [href, setHref] = useState<string>(MOCK_INTERVIEW_OFFER.checkoutPath);

  useEffect(() => {
    const current = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    const origem = current.get("origem");
    const candidatura = current.get("candidatura");
    if (origem) params.set("origem", origem);
    if (candidatura) params.set("candidatura", candidatura);
    if (params.size > 0) {
      setHref(`${MOCK_INTERVIEW_OFFER.checkoutPath}?${params}`);
    }
  }, []);

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}
