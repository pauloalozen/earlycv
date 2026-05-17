"use client";

import { useFormStatus } from "react-dom";

import { buttonVariants } from "@/components/ui";

export function RunSourceSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className={buttonVariants()} disabled={pending} type="submit">
      {pending ? "Executando..." : "Rodar agora"}
    </button>
  );
}
