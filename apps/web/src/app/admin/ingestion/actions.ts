"use server";

import { redirect } from "next/navigation";

import { runJobSource } from "@/lib/admin-ingestion-api";

function withMessage(
  redirectPath: string,
  status: "error" | "success",
  message: string,
) {
  const url = new URL(`http://localhost${redirectPath}`);

  url.searchParams.set("status", status);
  url.searchParams.set("message", message);

  return `${url.pathname}?${url.searchParams.toString()}`;
}

export async function runJobSourceAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const jobSourceId = String(formData.get("jobSourceId") ?? "").trim();
  const redirectPath = String(
    formData.get("redirectPath") ?? "/admin/ingestion",
  );

  if (!token || !jobSourceId) {
    redirect(withMessage(redirectPath, "error", "Informe o token e a fonte."));
  }

  try {
    await runJobSource(token, jobSourceId);
    redirect(
      withMessage(redirectPath, "success", "Ingestao executada com sucesso."),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao executar ingestao.";

    redirect(withMessage(redirectPath, "error", message));
  }
}
