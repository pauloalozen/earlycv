"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildAdminRedirect } from "@/lib/admin-ingestion-flow";
import {
  type AlertRolloutSegment,
  applyAlertRollout,
  type DigestSchedule,
  type EmailBulkSendMode,
  previewAlertRollout,
  resendAdminMonitorDigest,
  type SesRolloutSegment,
  searchAdminMonitorUsers,
  sendMonitorDigestNow,
  setAlertPreference,
  trackAlertUser,
  updateAlertRolloutPolicy,
  updateMonitorDigestContent,
  updateMonitorDigestSchedule,
} from "@/lib/admin-monitor-api";

const ROOT_REDIRECT_PATH = "/admin/alerta-vagas";

// Cada action só delega para AdminMonitorService (via admin-monitor-api) —
// nenhuma escrita acontece aqui. redirectPath carrega a query string atual
// (filtros/paginação) num hidden input, pra sobreviver ao redirect com a
// mensagem de resultado (mesmo padrão de admin/ingestion/actions.ts).

// Chamado direto (sem <form>) pelo combobox client de "+ Incluir usuário"
// — busca sobre a base inteira de usuários (não sobre a lista já
// rastreada, que é o que a tabela da seção mostra).
export async function searchUsersToTrackAction(query: string) {
  if (!query.trim()) return [];
  const { users } = await searchAdminMonitorUsers({ query, limit: 8 });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
  }));
}

export async function trackAlertUserAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );
  if (!userId) {
    redirect(
      buildAdminRedirect(redirectPath, "error", "Selecione um usuário."),
    );
  }

  try {
    await trackAlertUser(userId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao incluir usuário.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(
    buildAdminRedirect(redirectPath, "success", "Usuário incluído na lista."),
  );
}

// Toggle por linha — liga/desliga 1 usuário específico sem precisar de uma
// ação em massa (ver AlertRolloutSection).
export async function setAlertPreferenceAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const emailEnabled = formData.get("emailEnabled") === "true";
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );

  let outcome: { status: "success" | "error"; message: string };
  try {
    await setAlertPreference(userId, emailEnabled);
    outcome = {
      status: "success",
      message: `Alerta ${emailEnabled ? "ativado" : "desativado"} pra esse usuário.`,
    };
  } catch (error) {
    outcome = {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Falha ao atualizar o alerta desse usuário.",
    };
  }

  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(buildAdminRedirect(redirectPath, outcome.status, outcome.message));
}

export async function sendDigestNowAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );
  if (!userId) {
    redirect(buildAdminRedirect(redirectPath, "error", "Usuário inválido."));
  }

  // redirect() lança internamente pro Next desviar a resposta — nunca
  // chamado de dentro do try/catch, senão o próprio catch abaixo o
  // capturaria como um erro genérico.
  let outcome: { status: "success" | "error"; message: string };
  try {
    const result = await sendMonitorDigestNow(userId);
    if (result.sent) {
      outcome = {
        status: "success",
        message: `Digest enviado com ${result.recommendationCount ?? 0} vaga(s).`,
      };
    } else {
      const reasonLabel: Record<string, string> = {
        not_entitled: "usuário não é elegível hoje",
        no_eligible_recommendations: "nenhuma vaga elegível pra incluir",
        send_failed: "falha ao enviar o e-mail",
      };
      outcome = {
        status: "error",
        message: `Digest não enviado: ${reasonLabel[result.skippedReason ?? ""] ?? result.skippedReason}.`,
      };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao disparar o digest.";
    outcome = { status: "error", message };
  }

  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(buildAdminRedirect(redirectPath, outcome.status, outcome.message));
}

export async function updateDigestScheduleAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );
  const frequency = String(formData.get("frequency") ?? "DAILY");
  const dailyHour = Number(formData.get("dailyHour"));
  const dailyMinute = Number(formData.get("dailyMinute"));
  const weeklyDayOfWeek = Number(formData.get("weeklyDayOfWeek"));
  const sesMode = String(formData.get("sesMode") ?? "LEGACY_RESEND");
  const sesRolloutSegmentRaw = formData.get("sesRolloutSegment");
  const sesRolloutSegment =
    sesRolloutSegmentRaw && sesRolloutSegmentRaw !== ""
      ? (String(sesRolloutSegmentRaw) as SesRolloutSegment)
      : null;

  try {
    await updateMonitorDigestSchedule({
      dailyHour,
      dailyMinute,
      frequency: frequency as DigestSchedule["frequency"],
      weeklyDayOfWeek,
      sesMode: sesMode as EmailBulkSendMode,
      sesRolloutSegment,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar o horário.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(buildAdminRedirect(redirectPath, "success", "Agendamento salvo."));
}

export async function updateDigestContentAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );
  const subject = String(formData.get("subject") ?? "").trim();
  const introText = String(formData.get("introText") ?? "");

  if (!subject) {
    redirect(
      buildAdminRedirect(redirectPath, "error", "Assunto é obrigatório."),
    );
  }

  try {
    await updateMonitorDigestContent({ subject, introText });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar o conteúdo.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(
    buildAdminRedirect(redirectPath, "success", "Conteúdo do e-mail salvo."),
  );
}

// Reseta um MonitorDigest FAILED pra PENDING — o MonitorDigestWorker
// reprocessa no próximo tick (até 30s), reaproveitando a mesma
// Idempotency-Key já usada no Resend. Mesma lógica de
// AdminMonitorService.resendDigest, só que agora exposta aqui (a tela de
// falhas de digest saiu do /admin/monitor).
export async function resendDigestAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );
  if (!id) return;

  await resendAdminMonitorDigest(id);
  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(
    buildAdminRedirect(redirectPath, "success", "Digest reenfileirado."),
  );
}

// Chamado direto pelo modal de confirmação (sem <form>), antes de aplicar
// de fato — o admin precisa ver quantos usuários serão afetados antes de
// confirmar uma ação em massa.
export async function previewAlertRolloutAction(
  segment: AlertRolloutSegment,
  enable: boolean,
) {
  return previewAlertRollout(segment, enable);
}

export async function applyAlertRolloutAction(formData: FormData) {
  const segment = String(formData.get("segment") ?? "") as AlertRolloutSegment;
  const enable = formData.get("enable") === "true";
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );

  // redirect() lança internamente pro Next desviar a resposta — nunca
  // chamado de dentro do try/catch, senão o próprio catch abaixo o
  // capturaria como um erro genérico (mesmo cuidado de sendDigestNowAction
  // acima).
  let outcome: { status: "success" | "error"; message: string };
  try {
    const result = await applyAlertRollout(segment, enable);
    outcome = {
      status: "success",
      message: `${result.changedCount} usuário(s) ${enable ? "ativado(s)" : "desativado(s)"} (${result.matchingCount} no segmento).`,
    };
  } catch (error) {
    outcome = {
      status: "error",
      message:
        error instanceof Error ? error.message : "Falha ao aplicar em massa.",
    };
  }

  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(buildAdminRedirect(redirectPath, outcome.status, outcome.message));
}

export async function updateAlertRolloutPolicyAction(formData: FormData) {
  const redirectPath = String(
    formData.get("redirectPath") ?? ROOT_REDIRECT_PATH,
  );
  const active = formData.get("active") === "true";
  const segment = String(formData.get("segment") ?? "ALL") as "ALL" | "PAID";
  const cutoffAtRaw = String(formData.get("cutoffAt") ?? "").trim();
  const cutoffAt = cutoffAtRaw
    ? new Date(`${cutoffAtRaw}T23:59:59`).toISOString()
    : null;

  try {
    await updateAlertRolloutPolicy({ active, segment, cutoffAt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao salvar a política.";
    redirect(buildAdminRedirect(redirectPath, "error", message));
  }

  revalidatePath(ROOT_REDIRECT_PATH);
  redirect(
    buildAdminRedirect(redirectPath, "success", "Política de inscrição salva."),
  );
}
