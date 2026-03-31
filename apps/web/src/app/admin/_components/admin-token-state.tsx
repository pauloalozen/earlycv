import Link from "next/link";

import { buttonVariants, Card } from "@/components/ui";

type AdminTokenStateProps = {
  description: string;
  title: string;
};

export function AdminTokenState({ description, title }: AdminTokenStateProps) {
  return (
    <Card className="mx-auto max-w-2xl space-y-4" padding="lg">
      <h1 className="text-2xl font-bold tracking-tight text-stone-950">
        {title}
      </h1>
      <p className="text-sm leading-7 text-stone-600">{description}</p>
      <Link className={buttonVariants()} href="/admin/ingestion">
        Voltar para o acesso do admin
      </Link>
    </Card>
  );
}
