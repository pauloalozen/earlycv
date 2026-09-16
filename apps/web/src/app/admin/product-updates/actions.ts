"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildAdminRedirect } from "@/lib/admin-ingestion-flow";
import {
  cancelProductUpdate,
  createProductUpdate,
  markProductUpdateReady,
  sendTestProductUpdate,
  startProductUpdate,
  updateProductUpdate,
} from "@/lib/admin-product-updates-api";

const LIST_PATH = "/admin/product-updates";

function redirectPathFor(id: string, formData: FormData) {
  return String(formData.get("redirectPath") ?? `${LIST_PATH}/${id}`);
}

export async function createProductUpdateAction(formData: FormData) {
  const internalName = String(formData.get("internalName") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!internalName || !subject || !content) {
    redirect(
      buildAdminRedirect(
        LIST_PATH,
        "error",
        "Nome interno, assunto e conteúdo são obrigatórios.",
      ),
    );
  }

  let created: { id: string };
  try {
    created = await createProductUpdate({ internalName, subject, content });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao criar campanha.";
    redirect(buildAdminRedirect(LIST_PATH, "error", message));
  }

  redirect(`${LIST_PATH}/${created.id}`);
}

export type UpdateProductUpdateActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

// Ligada via useActionState (ver editor-form.tsx) em vez de redirect — um
// erro de validação (ex.: URL do botão insegura) NUNCA pode apagar o que
// o admin digitou. redirect() força uma navegação completa, que descarta
// o valor não salvo dos campos (eles voltam a refletir o que já estava
// persistido); devolvendo estado em vez de redirecionar, a página nunca
// recarrega e os campos (não controlados, com defaultValue) mantêm
// exatamente o que foi digitado.
export async function updateProductUpdateAction(
  _prevState: UpdateProductUpdateActionState,
  formData: FormData,
): Promise<UpdateProductUpdateActionState> {
  const id = String(formData.get("id") ?? "");

  try {
    await updateProductUpdate(id, {
      subject: String(formData.get("subject") ?? ""),
      preheader: String(formData.get("preheader") ?? "") || null,
      content: String(formData.get("content") ?? ""),
      primaryButtonText:
        String(formData.get("primaryButtonText") ?? "") || null,
      primaryButtonUrl: String(formData.get("primaryButtonUrl") ?? "") || null,
      optionalFooterContent:
        String(formData.get("optionalFooterContent") ?? "") || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar rascunho.";
    return { status: "error", message };
  }

  revalidatePath(`/admin/product-updates/${id}`);
  return { status: "success", message: "Rascunho salvo." };
}

export async function sendTestProductUpdateAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim();
  const redirectPath = redirectPathFor(id, formData);

  if (!recipientEmail) {
    redirect(
      buildAdminRedirect(redirectPath, "error", "Informe um e-mail de teste."),
    );
  }

  try {
    await sendTestProductUpdate(id, recipientEmail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao enviar teste.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      `Teste enviado para ${recipientEmail}.`,
    ),
  );
}

export async function markProductUpdateReadyAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const redirectPath = redirectPathFor(id, formData);

  try {
    await markProductUpdateReady(id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao marcar como pronta.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      "Campanha marcada como pronta.",
    ),
  );
}

export async function startProductUpdateAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const redirectPath = redirectPathFor(id, formData);
  const audience = String(formData.get("audience") ?? "");
  const confirmedRecipientCount = Number(
    formData.get("confirmedRecipientCount") ?? "0",
  );

  if (
    audience !== "INTERNAL_TEST" &&
    audience !== "PAID" &&
    audience !== "ALL_ELIGIBLE_USERS"
  ) {
    redirect(
      buildAdminRedirect(redirectPath, "error", "Selecione um público."),
    );
  }

  try {
    await startProductUpdate(id, { audience, confirmedRecipientCount });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao iniciar envio.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(buildAdminRedirect(redirectPath, "success", "Envio iniciado."));
}

export async function cancelProductUpdateAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const redirectPath = redirectPathFor(id, formData);

  try {
    await cancelProductUpdate(id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao cancelar envio.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  redirect(
    buildAdminRedirect(
      redirectPath,
      "success",
      "Envio cancelado — entregas já feitas não são afetadas.",
    ),
  );
}
