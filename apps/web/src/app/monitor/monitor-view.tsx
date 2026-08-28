"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics-tracking";
import {
  getMonitorCount,
  getMonitorLevelCounts,
  getMonitorProfile,
  listMonitorRecommendations,
  type MonitorAlertPreference,
  type MonitorProfile,
  type MonitorProfileStatus,
  type MonitorRecommendationItem,
  type MonitorSort,
} from "@/lib/monitor-api";
import { MonitorAlertPreferences } from "./monitor-alert-preferences";
import {
  captureMonitorEmailOriginFromUrl,
  getMonitorProductOrigin,
} from "./monitor-attribution";
import {
  MonitorGridStyles,
  MonitorLevelSection,
} from "./monitor-level-section";
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
const PAGE_SIZE = 4;
const LEVELS_DESC = [5, 4, 3, 2, 1, 0] as const;

const POLL_INTERVAL_MS = 8_000;
const MAX_POLL_ATTEMPTS = 38;

export type MonitorLevelSectionData = {
  level: number;
  items: MonitorRecommendationItem[];
  total: number;
};

export function MonitorView({
  initialSections,
  initialMonitorStatus,
  initialProfile,
  initialAlertPreference,
}: {
  initialSections: MonitorLevelSectionData[];
  initialMonitorStatus: MonitorProfileStatus;
  initialProfile: MonitorProfile | null;
  initialAlertPreference: MonitorAlertPreference | null;
}) {
  const [sections, setSections] = useState(initialSections);
  const [monitorStatus, setMonitorStatus] = useState(initialMonitorStatus);
  const [profile, setProfile] = useState(initialProfile);
  const [editorOpen, setEditorOpen] = useState(false);
  const [sort, setSort] = useState<MonitorSort>("score");
  const pollAttempts = useRef(0);

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

  const refreshSections = useCallback(async () => {
    const [counts, countInfo] = await Promise.all([
      getMonitorLevelCounts(),
      getMonitorCount(),
    ]);
    const nonEmptyLevels = LEVELS_DESC.filter(
      (level) => (counts[level] ?? 0) > 0,
    );
    const feeds = await Promise.all(
      nonEmptyLevels.map((level) =>
        listMonitorRecommendations(1, PAGE_SIZE, false, level, sort),
      ),
    );
    setSections(
      nonEmptyLevels.map((level, i) => ({
        level,
        items: feeds[i].items,
        total: feeds[i].total,
      })),
    );
    setMonitorStatus(countInfo.monitorStatus);
    return countInfo.monitorStatus;
  }, [sort]);

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
      const status = await refreshSections();
      if (status === "ACTIVE") {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [monitorStatus, refreshSections]);

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

  const totalActive = sections.reduce((sum, s) => sum + s.total, 0);

  // Sem UserRadarProfile (nunca subiu CV master) não há o que monitorar —
  // mesmo caso do Radar sem CV, mas aqui o Monitor não tem uma listagem
  // genérica pra cair de volta (ver ADENDO DE PRODUTO: não é um segundo
  // Radar), então direciona pro fluxo de upload.
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
          Seu Monitor ainda não foi configurado
        </p>
        <p
          style={{
            margin: "0 auto 20px",
            fontSize: 13.5,
            color: "#6a6560",
            maxWidth: 420,
          }}
        >
          Envie seu currículo para o EarlyCV gerar automaticamente o perfil que
          o Monitor usa para procurar vagas por você.
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <MonitorGridStyles />

      {/* Configuração do Monitor — o principal da rota, sempre no topo */}
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

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 1,
                color: "#8a8a85",
                margin: "0 0 4px",
              }}
            >
              O QUE ENCONTRAMOS PARA VOCÊ
            </p>
            {monitorStatus === "ACTIVE" ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: -0.02,
                }}
              >
                {totalActive} vaga{totalActive === 1 ? "" : "s"} ativa
                {totalActive === 1 ? "" : "s"} no seu radar
              </p>
            ) : null}
          </div>

          {monitorStatus === "ACTIVE" && totalActive > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  marginRight: 2,
                }}
              >
                ORDENAR
              </span>
              <button
                type="button"
                aria-pressed={sort === "score"}
                onClick={() => setSort("score")}
                style={{
                  padding: "7px 13px",
                  borderRadius: 99,
                  border: `1px solid ${sort === "score" ? "#0a0a0a" : "rgba(10,10,10,0.12)"}`,
                  background: sort === "score" ? "#0a0a0a" : "#fff",
                  color: sort === "score" ? "#fafaf6" : "#3a3a38",
                  fontSize: 12,
                  fontFamily: GEIST,
                  cursor: "pointer",
                }}
              >
                Maior aderência
              </button>
              <button
                type="button"
                aria-pressed={sort === "recent"}
                onClick={() => setSort("recent")}
                style={{
                  padding: "7px 13px",
                  borderRadius: 99,
                  border: `1px solid ${sort === "recent" ? "#0a0a0a" : "rgba(10,10,10,0.12)"}`,
                  background: sort === "recent" ? "#0a0a0a" : "#fff",
                  color: sort === "recent" ? "#fafaf6" : "#3a3a38",
                  fontSize: 12,
                  fontFamily: GEIST,
                  cursor: "pointer",
                }}
              >
                Mais recentes
              </button>
            </div>
          ) : null}
        </div>

        {monitorStatus === "INITIALIZING" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <MonitorInitializingBanner />
            <MonitorSkeletonCards />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {monitorStatus === "REFRESHING" ? (
              <MonitorRefreshingBanner />
            ) : null}

            {totalActive === 0 ? (
              <MonitorEmptyActiveState onEdit={handleEditRequested} />
            ) : (
              sections.map((section) => (
                <MonitorLevelSection
                  key={section.level}
                  level={section.level}
                  initialItems={section.items}
                  initialTotal={section.total}
                  pageSize={PAGE_SIZE}
                  sort={sort}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
