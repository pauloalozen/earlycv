import type { BusinessFunnelEventName } from "./analysis-event-version.registry";

export type BusinessFunnelEventSource = "backend" | "frontend";

export const FUNNEL_EVENT_OWNERSHIP: Record<
  BusinessFunnelEventName,
  BusinessFunnelEventSource
> = {
  analysis_started: "backend",
  analysis_completed: "backend",
  analysis_failed: "backend",
  analysis_result_viewed: "frontend",
  analyze_submit_clicked: "frontend",
  auth_session_identified: "frontend",
  auth_oauth_redirect_started: "frontend",
  blog_cta_clicked: "frontend",
  blog_index_viewed: "frontend",
  blog_post_viewed: "frontend",
  seo_page_cta_clicked: "frontend",
  seo_page_viewed: "frontend",
  cta_signup_click: "frontend",
  buy_credits_clicked: "frontend",
  checkout_abandoned: "frontend",
  checkout_started: "frontend",
  checkout_brick_ready: "frontend",
  checkout_brick_submit_started: "frontend",
  checkout_brick_submit_failed: "frontend",
  cv_unlock_completed: "frontend",
  cv_unlock_started: "frontend",
  cv_upload_completed: "backend",
  dashboard_viewed: "frontend",
  optimized_cv_downloaded: "frontend",
  full_analysis_viewed: "backend",
  job_description_focus: "frontend",
  job_description_filled: "frontend",
  job_description_paste: "frontend",
  landing_cta_click: "frontend",
  login_completed: "backend",
  page_leave: "frontend",
  payment_return_viewed: "frontend",
  plan_selected: "frontend",
  site_exit: "frontend",
  site_exit_candidate: "frontend",
  page_view: "frontend",
  payment_approved: "backend",
  payment_failed: "backend",
  session_engaged: "frontend",
  session_started: "frontend",
  signup_completed: "backend",
  signup_started: "frontend",
  teaser_scroll: "frontend",
  teaser_viewed: "backend",
  unlock_cv_click: "frontend",
  // Candidaturas
  candidaturas_page_viewed: "frontend",
  candidatura_created: "backend",
  candidatura_detail_viewed: "frontend",
  candidatura_status_changed: "backend",
  candidatura_marked_as_applied: "backend",
  candidatura_archived: "backend",
  candidatura_deleted: "backend",
  candidatura_note_added: "backend",
  candidatura_rejection_feedback_submitted: "backend",
  // Radar
  radar_view: "frontend",
  radar_opportunity_clicked: "frontend",
  job_detail_viewed: "frontend",
  // Meu Monitor — viewed/dismissed/feedback/profile_updated são emitidos
  // pelo backend nesta fase (mutações reais em UserJobRecommendation /
  // UserRadarProfile via apps/api/src/monitor/). view/clicked/
  // application_started ficam registrados para quando o frontend do
  // Monitor existir (page view e cliques são eventos de interação, não
  // faz sentido inferir a partir de uma chamada de API isolada — ver
  // decisão documentada na spec da Fase 1). monitor_recommendation_saved
  // virou "backend" na Fase 3: SavedJobsService.save() agora sabe a
  // origem (SaveJobDto.origin) e emite direto no server quando
  // origin=MONITOR, sem depender do frontend chamar trackEvent separado
  // (evita perder o evento se o clique de salvar não navegar/re-renderizar).
  monitor_view: "frontend",
  monitor_profile_viewed: "frontend",
  monitor_profile_updated: "backend",
  monitor_recommendation_viewed: "backend",
  monitor_recommendation_clicked: "frontend",
  monitor_recommendation_saved: "backend",
  monitor_recommendation_dismissed: "backend",
  monitor_recommendation_feedback: "backend",
  monitor_application_started: "frontend",
  // Alteração de frequência (DAILY/WEEKLY/OFF, em qualquer direção) —
  // backend-owned porque a mutação real acontece no endpoint (ver
  // MonitorAlertPreferenceService.update); nunca confundir com
  // monitor_digest_unsubscribed, que é exclusivo do fluxo de e-mail/token.
  monitor_alert_frequency_changed: "backend",
  // Digest por e-mail (Fase 3) — sent/unsubscribed são ações que só o
  // backend consegue afirmar de verdade (o e-mail foi de fato mandado /
  // o unsubscribe foi processado). delivered/opened/clicked/bounced/
  // complained vêm do webhook do Resend (Svix) — também backend, nunca
  // confiar em parâmetro vindo do frontend pra essas métricas de entrega.
  monitor_digest_sent: "backend",
  monitor_digest_delivered: "backend",
  monitor_digest_opened: "backend",
  monitor_digest_clicked: "backend",
  monitor_digest_bounced: "backend",
  monitor_digest_complained: "backend",
  monitor_digest_unsubscribed: "backend",
  // Interview Prep
  interview_prep_drawer_opened: "frontend",
  interview_prep_generate_clicked: "frontend",
  interview_prep_generated: "backend",
  interview_prep_viewed: "frontend",
  interview_prep_printed: "frontend",
  // Cover Letter
  cover_letter_generate_clicked: "frontend",
  cover_letter_generated: "backend",
};
