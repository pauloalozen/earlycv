"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  dismissRecommendation,
  getMonitorProfile,
  listMonitorNotifications,
  markRecommendationViewed,
  type MonitorAlertPreference,
  type MonitorNotificationsFeed,
  type MonitorProfile,
  type MonitorProfileStatus,
  type MonitorRecommendationFeedback,
  type MonitorRecommendationFeedbackReason,
  type MonitorRecommendationItem,
  submitRecommendationFeedback,
} from "@/lib/monitor-api";
import { MonitorAlertPreferences } from "./monitor-alert-preferences";
import {
  captureMonitorEmailOriginFromUrl,
  getMonitorProductOrigin,
} from "./monitor-attribution";
import { MonitorGridStyles } from "./monitor-grid-styles";
import { MonitorNotificationGroup } from "./monitor-notification-group";
import { MonitorProfileEditor } from "./monitor-profile-editor";
import { MonitorProfileSummary } from "./monitor-profile-summary";
import {
  MonitorEmptyActiveState,
  MonitorInitializingBanner,
  MonitorRefreshingBanner,
  MonitorSkeletonCards,
} from "./monitor-status-banner";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const GROUP_PAGE_SIZE = 10;

const POLL_INTERVAL_MS = 8_000;
const MAX_POLL_ATTEMPTS = 38;

function updateItemInFeed(
  feed: MonitorNotificationsFeed,
  recommendationId: string,
  updater: (item: MonitorRecommendationItem) => MonitorRecommendationItem,
): MonitorNotificationsFeed {
  const applyTo = (items: MonitorRecommendationItem[]) =>
    items.map((item) =>
      item.recommendationId === recommendationId ? updater(item) : item,
    );
  return {
    ...feed,
    pending: feed.pending
      ? { ...feed.pending, items: applyTo(feed.pending.items) }
      : feed.pending,
    groups: feed.groups.map((group) => ({
      ...group,
      items: applyTo(group.items),
    })),
  };
}

export function MonitorView({
  initialNotifications,
  initialMonitorStatus,
  initialProfile,
  initialAlertPreference,
}: {
  initialNotifications: MonitorNotificationsFeed;
  initialMonitorStatus: MonitorProfileStatus;
  initialProfile: MonitorProfile | null;
  initialAlertPreference: MonitorAlertPreference | null;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [monitorStatus, setMonitorStatus] = useState(initialMonitorStatus);
  const [profile, setProfile] = useState(initialProfile);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loadingMoreGroups, setLoadingMoreGroups] = useState(false);
  const [loadingMorePending, setLoadingMorePending] = useState(false);
  // Sanfona igual à de /candidaturas — chave "pending" pro bucket de
  // novas vagas, digestId pra cada envio. Aberto por padrão (mesma
  // convenção de StatusAccordion) até o usuário colapsar manualmente.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    {},
  );
  const pollAttempts = useRef(0);

  function toggleSection(key: string) {
    setOpenSections((current) => ({
      ...current,
      [key]: !(current[key] ?? true),
    }));
  }

  useEffect(() => {
    // Precisa rodar ANTES do trackEvent abaixo — é essa chamada que decide
    // se este e os próximos eventos da sessão carregam
    // product_origin=monitor_email (ver monitor-attribution.ts).
    captureMonitorEmailOriginFromUrl();
    void trackEvent({
      eventName: "monitor_view",
      eventVersion: 1,
      properties: { product_origin: getMonitorProductOrigin() },
    });
  }, []);

  const refreshNotifications = useCallback(async () => {
    const feed = await listMonitorNotifications(1, GROUP_PAGE_SIZE);
    setNotifications(feed);
    setMonitorStatus(feed.monitorStatus);
    return feed.monitorStatus;
  }, []);

  useEffect(() => {
    if (monitorStatus === "ACTIVE") {
      pollAttempts.current = 0;
      return;
    }

    const interval = setInterval(async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        return;
      }
      const status = await refreshNotifications();
      if (status === "ACTIVE") {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [monitorStatus, refreshNotifications]);

  function handleProfileSaved(updated: MonitorProfile) {
    setProfile(updated);
    setMonitorStatus(updated.monitorStatus);
    pollAttempts.current = 0;
  }

  async function handleEditRequested() {
    if (!profile) {
      const fresh = await getMonitorProfile();
      if (fresh) setProfile(fresh);
    }
    setEditorOpen(true);
  }

  function handleViewed(recommendationId: string) {
    setNotifications((current) =>
      updateItemInFeed(current, recommendationId, (item) =>
        item.isNew
          ? { ...item, isNew: false, viewedAt: new Date().toISOString() }
          : item,
      ),
    );
    void markRecommendationViewed(recommendationId);
  }

  function handleFeedback(
    recommendationId: string,
    feedback: MonitorRecommendationFeedback,
    feedbackReason?: MonitorRecommendationFeedbackReason,
  ) {
    setNotifications((current) =>
      updateItemInFeed(current, recommendationId, (item) => ({
        ...item,
        feedback,
        feedbackReason: feedbackReason ?? null,
      })),
    );
    void submitRecommendationFeedback(
      recommendationId,
      feedback,
      feedbackReason,
    );
  }

  // Bucket "Novas vagas encontradas": ignorar remove o card na hora (evita
  // ele entrar no próximo envio) — diferente de um grupo já enviado, onde
  // ignorar não desmanda o e-mail, só marca "Descartada" (ver
  // handleSentDismiss).
  function handlePendingDismiss(recommendationId: string) {
    setNotifications((current) => {
      if (!current.pending) return current;
      return {
        ...current,
        pending: {
          ...current.pending,
          items: current.pending.items.filter(
            (item) => item.recommendationId !== recommendationId,
          ),
          total: Math.max(0, current.pending.total - 1),
        },
      };
    });
    void dismissRecommendation(recommendationId);
  }

  function handleSentDismiss(recommendationId: string) {
    setNotifications((current) =>
      updateItemInFeed(current, recommendationId, (item) => ({
        ...item,
        dismissedAt: new Date().toISOString(),
      })),
    );
    void dismissRecommendation(recommendationId);
  }

  async function loadMoreGroups() {
    if (!notifications.nextPage || loadingMoreGroups) return;
    setLoadingMoreGroups(true);
    const feed = await listMonitorNotifications(
      notifications.nextPage,
      notifications.limit,
    );
    setNotifications((current) => ({
      ...current,
      groups: [...current.groups, ...feed.groups],
      page: feed.page,
      totalGroups: feed.totalGroups,
      hasMore: feed.hasMore,
      nextPage: feed.nextPage,
    }));
    setLoadingMoreGroups(false);
  }

  async function loadMorePending() {
    if (!notifications.pending?.hasMore || loadingMorePending) return;
    setLoadingMorePending(true);
    const nextLimit = notifications.pending.items.length * 2;
    const feed = await listMonitorNotifications(
      1,
      notifications.limit,
      nextLimit,
    );
    setNotifications((current) => ({ ...current, pending: feed.pending }));
    setLoadingMorePending(false);
  }

  // Sem UserRadarProfile (nunca subiu CV master) não há o que monitorar —
  // mesmo caso do Radar sem CV, mas aqui o Alerta de Vaga Certa não tem
  // uma listagem genérica pra cair de volta, então direciona pro fluxo de
  // upload.
  if (!profile) {
    return (
      <div
        style={{
          background: "#fafaf6",
          border: "1px solid rgba(10,10,10,0.08)",
          borderRadius: 16,
          padding: "40px 28px",
          textAlign: "center",
          fontFamily: GEIST,
        }}
      >
        <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 500 }}>
          Seu Alerta de Vaga Certa ainda não foi configurado
        </p>
        <p
          style={{
            margin: "0 auto 20px",
            fontSize: 13.5,
            color: "#6a6560",
            maxWidth: 420,
          }}
        >
          Envie seu currículo para o EarlyCV gerar automaticamente o perfil
          que o Alerta de Vaga Certa usa para procurar vagas por você.
        </p>
        <a
          href="/adaptar"
          style={{
            display: "inline-flex",
            padding: "10px 18px",
            borderRadius: 9,
            background: "#0a0a0a",
            color: "#fafaf6",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Enviar meu currículo →
        </a>
      </div>
    );
  }

  const hasPending = (notifications.pending?.items.length ?? 0) > 0;
  const hasGroups = notifications.groups.length > 0;
  const hasAnything = hasPending || hasGroups;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <MonitorGridStyles />

      {/* Configuração do alerta — o principal da rota, sempre no topo */}
      <div className="monitor-config-grid" style={{ display: "grid", gap: 16 }}>
        <MonitorProfileSummary profile={profile} onEdit={handleEditRequested} />
        <MonitorAlertPreferences initialPreference={initialAlertPreference} />
      </div>
      <style>{`
        .monitor-config-grid { grid-template-columns: 1.55fr 1fr; }
        @media (max-width: 900px) { .monitor-config-grid { grid-template-columns: 1fr; } }
      `}</style>

      <MonitorProfileEditor
        open={editorOpen}
        profile={profile}
        onClose={() => setEditorOpen(false)}
        onSaved={handleProfileSaved}
      />

      {monitorStatus === "INITIALIZING" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <MonitorInitializingBanner />
          <MonitorSkeletonCards />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {monitorStatus === "REFRESHING" ? <MonitorRefreshingBanner /> : null}

          {!hasAnything ? (
            <MonitorEmptyActiveState onEdit={handleEditRequested} />
          ) : (
            <>
              {hasPending && notifications.pending ? (
                <div>
                  <MonitorNotificationGroup
                    variant="pending"
                    items={notifications.pending.items}
                    open={openSections.pending ?? true}
                    onToggle={() => toggleSection("pending")}
                    onViewed={handleViewed}
                    onDismiss={handlePendingDismiss}
                    onFeedback={handleFeedback}
                  />
                  {(openSections.pending ?? true) &&
                  notifications.pending.hasMore ? (
                    <button
                      type="button"
                      onClick={loadMorePending}
                      disabled={loadingMorePending}
                      style={{
                        marginTop: 4,
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "1px solid rgba(10,10,10,0.12)",
                        background: "#fff",
                        color: "#3a3a38",
                        fontSize: 12.5,
                        fontFamily: GEIST,
                        cursor: loadingMorePending ? "default" : "pointer",
                      }}
                    >
                      {loadingMorePending
                        ? "Carregando…"
                        : "Mostrar mais vagas encontradas"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {hasGroups ? (
                <div>
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      color: "#8a8a85",
                      margin: "0 0 14px",
                    }}
                  >
                    ALERTAS ENVIADOS
                  </p>
                  {notifications.groups.map((group) => (
                    <MonitorNotificationGroup
                      key={group.digestId}
                      variant="sent"
                      digestId={group.digestId}
                      sentAt={group.sentAt}
                      items={group.items}
                      open={openSections[group.digestId] ?? true}
                      onToggle={() => toggleSection(group.digestId)}
                      onViewed={handleViewed}
                      onDismiss={handleSentDismiss}
                      onFeedback={handleFeedback}
                    />
                  ))}
                  {notifications.hasMore ? (
                    <button
                      type="button"
                      onClick={loadMoreGroups}
                      disabled={loadingMoreGroups}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "1px solid rgba(10,10,10,0.12)",
                        background: "#fff",
                        color: "#3a3a38",
                        fontSize: 12.5,
                        fontFamily: GEIST,
                        cursor: loadingMoreGroups ? "default" : "pointer",
                      }}
                    >
                      {loadingMoreGroups ? "Carregando…" : "Mostrar mais alertas"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
