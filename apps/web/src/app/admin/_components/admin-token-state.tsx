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
    <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
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
