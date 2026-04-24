import type { BusinessFunnelEventName } from "./analysis-event-version.registry";

export type BusinessFunnelEventSource = "backend" | "frontend";

export const FUNNEL_EVENT_OWNERSHIP: Record<
  BusinessFunnelEventName,
  BusinessFunnelEventSource
> = {
  analysis_started: "backend",
  analyze_submit_clicked: "frontend",
  cta_signup_click: "frontend",
  checkout_abandoned: "frontend",
  checkout_started: "backend",
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
};
