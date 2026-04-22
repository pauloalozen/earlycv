import type { BusinessFunnelEventName } from "./analysis-event-version.registry";

export type BusinessFunnelEventSource = "backend" | "frontend";

export const FUNNEL_EVENT_OWNERSHIP: Record<
  BusinessFunnelEventName,
  BusinessFunnelEventSource
> = {
  adapt_page_view: "frontend",
  analysis_started: "backend",
  analyze_submit_clicked: "frontend",
  checkout_started: "backend",
  cv_upload_completed: "backend",
  cv_upload_started: "frontend",
  dashboard_viewed: "frontend",
  full_analysis_viewed: "backend",
  job_description_filled: "frontend",
  landing_cta_click: "frontend",
  landing_view: "frontend",
  login_completed: "backend",
  purchase_completed: "backend",
  signup_completed: "backend",
  signup_started: "frontend",
  teaser_viewed: "backend",
  unlock_cv_click: "frontend",
};
