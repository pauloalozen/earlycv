"use client";

import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/app/admin/_components/admin-button";

type Props = {
  action: (formData: FormData) => void;
  jobSourceId: string;
  redirectPath: string;
  sourceName: string;
  status: "active" | "inactive";
};

function SubmitButton({ status }: { status: "active" | "inactive" }) {
  const { pending } = useFormStatus();
  const label =
    status === "inactive"
      ? "Desativar todas as vagas"
      : "Ativar todas as vagas";

  return (
    <button
      className={buttonVariants({
        size: "sm",
        variant: status === "inactive" ? "outline" : "default",
      })}
      disabled={pending}
      type="submit"
    >
      {pending ? "Aplicando..." : label}
    </button>
  );
}

// Botão de emergência pra quando a fonte inteira foi cadastrada errada (ex:
// board global trazendo vaga de outro país que vazou pro board "Brasil" —
// caso real LOUIS DREYFUS BR) e corrigir vaga por vaga não é viável.
export function BulkJobsStatusForm({
  action,
  jobSourceId,
  redirectPath,
  sourceName,
  status,
}: Props) {
  const verb = status === "inactive" ? "desativar" : "ativar";

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const confirmed = window.confirm(
          `Isso vai ${verb} TODAS as vagas já ingeridas da fonte "${sourceName}", inclusive as que já estão publicadas no radar. Confirma?`,
        );
        if (!confirmed) {
          e.preventDefault();
        }
      }}
    >
      <input name="jobSourceId" type="hidden" value={jobSourceId} />
      <input name="redirectPath" type="hidden" value={redirectPath} />
      <input name="status" type="hidden" value={status} />
      <SubmitButton status={status} />
    </form>
  );
}
