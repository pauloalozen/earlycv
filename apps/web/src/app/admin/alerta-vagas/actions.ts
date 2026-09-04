"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildAdminRedirect } from "@/lib/admin-ingestion-flow";
import {
  resendAdminMonitorDigest,
  searchAdminMonitorUsers,
  sendMonitorDigestNow,
  trackAlertUser,
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
  const dailyHour = Number(formData.get("dailyHour"));
  const dailyMinute = Number(formData.get("dailyMinute"));
  const weeklyDayOfWeek = Number(formData.get("weeklyDayOfWeek"));

  try {
    await updateMonitorDigestSchedule({
      dailyHour,
      dailyMinute,
      weeklyDayOfWeek,
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
