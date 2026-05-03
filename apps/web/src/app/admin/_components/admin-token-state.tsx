import Link from "next/link";

import { buttonVariants, Card } from "@/components/ui";

type AdminTokenStateProps = {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  title: string;
};

export function AdminTokenState({
  actionHref = "/admin/ingestion",
  actionLabel = "Voltar para o acesso do admin",
  description,
  title,
}: AdminTokenStateProps) {
  return (
    <Card
      className="mx-auto max-w-2xl space-y-4 border-stone-200 bg-white"
      padding="lg"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
        admin / acesso interno
      </p>
      <h1 className="text-2xl font-bold tracking-tight text-stone-950">
        {title}
      </h1>
      <p className="text-sm leading-7 text-stone-600">{description}</p>
      <Link className={buttonVariants()} href={actionHref}>
        {actionLabel}
      </Link>
    </Card>
  );
}
