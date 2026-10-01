"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  type EmailDispatchMode,
  type EmailTemplateKey,
  type EmailTemplatePreview,
  type EmailTemplateSendTestResult,
  previewEmailTemplate,
  recoverPurchaseConfirmations,
  resetEmailTemplate,
  sendTestEmailTemplate,
  updateEmailSettings,
  updateEmailTemplate,
} from "@/lib/admin-emails-api";
import { brtInputToIso, parseEmailLines } from "@/lib/admin-emails-form";
import { buildAdminRedirect } from "@/lib/admin-ingestion-flow";

const SETTINGS_PATH = "/admin/emails/configuracoes";
const TEMPLATES_PATH = "/admin/emails/templates";
const PURCHASES_PATH = "/admin/emails/compras";

export type EmailsActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

const MODES = ["OFF", "SHADOW", "ALLOWLIST", "LIVE"] as const;

function asMode(value: FormDataEntryValue | null): EmailDispatchMode {
  const text = String(value ?? "OFF");
  return (MODES as readonly string[]).includes(text)
    ? (text as EmailDispatchMode)
    : "OFF";
}

// useActionState (ver settings-form.tsx): erro de validação devolve ESTADO em
// vez de redirect — o que o admin digitou nunca é apagado. As regras (cutoff
// obrigatório, allowlist, confirmação de LIVE) são do backend; esta action só
// converte o formulário e devolve a mensagem.
export async function updateEmailSettingsAction(
  _previous: EmailsActionState,
  formData: FormData,
): Promise<EmailsActionState> {
  try {
    await updateEmailSettings({
      welcomeMode: asMode(formData.get("welcomeMode")),
      feedbackMode: asMode(formData.get("feedbackMode")),
      feedbackSecondCallMode: asMode(formData.get("feedbackSecondCallMode")),
      purchaseConfirmationMode: asMode(
        formData.get("purchaseConfirmationMode"),
      ),
      startAt: brtInputToIso(String(formData.get("startAt") ?? "")),
      allowlist: parseEmailLines(String(formData.get("allowlist") ?? "")),
      extraBlocklist: parseEmailLines(
        String(formData.get("extraBlocklist") ?? ""),
      ),
      confirmLive: formData.get("confirmLive") === "on",
    });
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Falha ao salvar configurações.",
    };
  }

  revalidatePath(SETTINGS_PATH);
  revalidatePath("/admin/emails");
  return { status: "success", message: "Configurações salvas." };
}

export type TemplateActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function previewEmailTemplateAction(
  key: EmailTemplateKey,
  subject: string,
  body: string,
): Promise<
  { ok: true; preview: EmailTemplatePreview } | { ok: false; message: string }
> {
  try {
    return {
      ok: true,
      preview: await previewEmailTemplate(key, { subject, body }),
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Falha ao pré-visualizar.",
    };
  }
}

export async function saveEmailTemplateAction(
  key: EmailTemplateKey,
  subject: string,
  body: string,
): Promise<TemplateActionResult> {
  try {
    await updateEmailTemplate(key, { subject, body });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Falha ao salvar template.",
    };
  }
  revalidatePath(TEMPLATES_PATH);
  return { ok: true, message: "Template salvo." };
}

export async function resetEmailTemplateAction(
  key: EmailTemplateKey,
): Promise<TemplateActionResult> {
  try {
    await resetEmailTemplate(key);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Falha ao restaurar o padrão.",
    };
  }
  revalidatePath(TEMPLATES_PATH);
  return { ok: true, message: "Template restaurado para o texto padrão." };
}

export async function sendTestEmailTemplateAction(
  key: EmailTemplateKey,
  recipientEmail: string,
): Promise<
  | { ok: true; result: EmailTemplateSendTestResult }
  | { ok: false; message: string }
> {
  const email = recipientEmail.trim();
  if (!email)
    return { ok: false, message: "Informe o e-mail do destinatário do teste." };
  try {
    return { ok: true, result: await sendTestEmailTemplate(key, email) };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Falha ao enviar o teste.",
    };
  }
}

export async function recoverPurchaseConfirmationsAction(formData: FormData) {
  const sinceHours = Number(formData.get("sinceHours") ?? 24);
  let message: string;
  try {
    const report = await recoverPurchaseConfirmations(
      Number.isFinite(sinceHours) && sinceHours > 0 ? sinceHours : undefined,
    );
    message = report.applied
      ? `${report.recovered} de ${report.missing.length} confirmação(ões) recriada(s). O envio segue o modo atual.`
      : `Nada foi criado: o modo de confirmação de compra está ${report.mode}.`;
  } catch (error) {
    redirect(
      buildAdminRedirect(
        PURCHASES_PATH,
        "error",
        error instanceof Error ? error.message : "Falha ao recuperar.",
      ),
    );
  }
  revalidatePath(PURCHASES_PATH);
  redirect(buildAdminRedirect(PURCHASES_PATH, "success", message));
}
