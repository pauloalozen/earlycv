import Link from "next/link";
import type { PublicJob } from "@/lib/public-jobs-api";
import { CompanyLogo } from "./company-logo";
import {
  AdaptBtn,
  breakdownPct,
  MiniBar,
  OpportunityRing,
  opportunityLevel,
  SCORE,
  ScoreRing,
  scoreTier,
} from "./radar-ui";
import { SaveJobBtn } from "./save-job-btn";
import { ScoreBreakdownPanel } from "./score-breakdown";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Regras que dependem de breakpoint (mobile empilha em coluna, desktop
// fica lado a lado) — precisam viver em classes CSS porque inline style não
// tem @media. Só as propriedades sensíveis ao breakpoint estão aqui; o
// resto (cor, fonte, tamanho) continua inline. Renderizado uma vez por
// JobCard/JobCardLocked — duplicar o texto do <style> por card na lista é
// aceitável (mesmo padrão já usado em ScoreBreakdownPanel).
export function JobCardResponsiveStyles() {
  return (
    <style>{`
      .jc-top { display: flex; gap: 16px; align-items: center; }
      .jc-headtext { display: flex; gap: 14px; align-items: center; min-width: 0; flex: 0 1 320px; }
      .jc-cluster { display: flex; align-items: center; gap: 20px; margin-left: auto; flex-shrink: 0; }
      .jc-badges { display: flex; justify-content: flex-end; align-self: center; max-width: 220px; }
      .jc-actions { display: flex; align-items: center; gap: 10px; }
      .jc-ringcol { display: flex; flex-direction: column; align-items: center; gap: 8px; flex-shrink: 0; }
      .jc-ringcol-mobile { display: none; }
      @media (max-width: 640px) {
        .jc-top { flex-direction: column; align-items: stretch; gap: 14px; }
        .jc-headtext { flex: 1 1 auto; width: 100%; align-items: flex-start; }
        .jc-cluster { margin-left: 0; width: 100%; flex-direction: column; align-items: stretch; gap: 14px; }
        /* A referência de design (mCard) não mostra badges de tecnologia no
        card mobile — só no desktop. */
        .jc-badges { display: none; }
        .jc-ringcol { display: none; }
        .jc-ringcol-mobile { display: flex; }
        .jc-actions > :last-child { flex: 1; }
      }
    `}</style>
  );
}

const WORK_MODEL_LABELS: Record<string, string> = {
  remote: "Remoto",
  hybrid: "Híbrido",
  "on-site": "Presencial",
};

const SENIORITY_LABELS: Record<string, string> = {
  intern: "Estagiário",
  junior: "Júnior",
  junior_level: "Júnior",
  jr: "Júnior",
  mid: "Pleno",
  mid_level: "Pleno",
  pleno: "Pleno",
  senior: "Sênior",
  senior_level: "Sênior",
  sr: "Sênior",
  lead: "Lead",
  tech_lead: "Tech Lead",
  staff: "Staff",
  principal: "Principal",
};

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  if (diffH < 1) return "< 1h";
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "1 dia";
  if (diffD < 7) return `${diffD} dias`;
  const diffW = Math.floor(diffD / 7);
  if (diffW === 1) return "1 semana";
  return `${diffW} semanas`;
}

// Chips de tecnologia + senioridade — coluna própria à direita do bloco de
// texto (título/empresa/meta), alinhada verticalmente ao centro, em vez de
// quebrar linha abaixo da empresa (era assim antes; a referência de design
// mostra os badges alinhados à direita, na mesma altura do card).
export function JobKeywordBadges({ job }: { job: PublicJob }) {
  const seniorityLabel = job.seniorityLevel
    ? (SENIORITY_LABELS[job.seniorityLevel.toLowerCase()] ?? job.seniorityLevel)
    : null;
  const technologies = (job.technologies ?? []).slice(0, 3);

  if (technologies.length === 0 && !seniorityLabel) return null;

  return (
    <div
      className="jc-badges"
      style={{
        flexWrap: "wrap",
        alignContent: "center",
        gap: 5,
        flexShrink: 0,
      }}
    >
      {technologies.map((tech) => (
        <span
          key={tech}
          style={{
            background: "rgba(10,10,10,0.05)",
            color: "#3a3a38",
            fontFamily: MONO,
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
          }}
        >
          {tech}
        </span>
      ))}
      {seniorityLabel ? (
        <span
          style={{
            background: "rgba(10,10,10,0.05)",
            color: "#3a3a38",
            fontFamily: MONO,
            fontSize: 10,
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
          }}
        >
          {seniorityLabel}
        </span>
      ) : null}
    </div>
  );
}

export function JobMetaRow({ job }: { job: PublicJob }) {
  const alreadyAnalyzed =
    typeof job.existingApplication?.bestScore === "number";
  const published = job.publishedAtSource ?? job.firstSeenAt;
  const workModelLabel = job.workModel
    ? (WORK_MODEL_LABELS[job.workModel] ?? job.workModel)
    : null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 2,
          flexWrap: "wrap",
        }}
      >
        <Link
          href={`/radar/${job.slug}`}
          style={{
            fontSize: 15.5,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: "#0a0a0a",
            textDecoration: "none",
            lineHeight: 1.3,
          }}
        >
          {job.title}
        </Link>
        {alreadyAnalyzed ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              background: "#c6ff3a",
              color: "#405410",
              fontFamily: MONO,
              fontSize: 9.5,
              padding: "2px 6px",
              borderRadius: 4,
              fontWeight: 600,
              letterSpacing: 0.4,
              flexShrink: 0,
            }}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="#405410">
              <title>Vaga já analisada</title>
              <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
            Vaga já analisada
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 12.5, color: "#6a6560", marginBottom: 10 }}>
        {job.company}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11.5,
          color: "#6a6560",
          flexWrap: "wrap",
        }}
      >
        {job.location ? (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <title>Local</title>
              <circle
                cx="12"
                cy="10"
                r="3.2"
                stroke="#8a8a85"
                strokeWidth="1.6"
              />
              <path
                d="M19 10c0 5.5-7 12-7 12s-7-6.5-7-12a7 7 0 0 1 14 0z"
                stroke="#8a8a85"
                strokeWidth="1.6"
              />
            </svg>
            {job.location}
          </span>
        ) : null}
        {job.location ? (
          <span
            style={{
              width: 2,
              height: 2,
              borderRadius: "50%",
              background: "#c8c6bf",
              flexShrink: 0,
            }}
          />
        ) : null}
        {workModelLabel ? (
          <>
            <span>{workModelLabel.toLowerCase()}</span>
            <span
              style={{
                width: 2,
                height: 2,
                borderRadius: "50%",
                background: "#c8c6bf",
                flexShrink: 0,
              }}
            />
          </>
        ) : null}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <title>Tempo</title>
            <circle cx="12" cy="12" r="9" stroke="#8a8a85" strokeWidth="1.6" />
            <path
              d="M12 7v5l3 2"
              stroke="#8a8a85"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          há {formatRelativeTime(published)}
        </span>
      </div>
    </>
  );
}

// Desktop: anel em cima, legenda embaixo, empilhados e centralizados
// (jc-ringcol). Mobile: anel ao lado do texto, igual ao mScoreRow da
// referência — estrutura horizontal diferente o bastante da desktop pra não
// dar pra resolver só com CSS, por isso os dois blocos de JSX (alternados
// por .jc-ringcol / .jc-ringcol-mobile, mesmo padrão de
// ScoreBreakdownPanel).
function ScoreIndicator({
  mobile,
  hasScore,
  displayScore,
  hasAnalysis,
  showScore,
}: {
  mobile: boolean;
  hasScore: boolean;
  displayScore: number | null | undefined;
  hasAnalysis: boolean;
  showScore: boolean;
}) {
  const ringSize = mobile ? 56 : 64;

  if (hasScore && typeof displayScore === "number") {
    if (hasAnalysis) {
      const tier = SCORE[scoreTier(displayScore)];

      if (mobile) {
        return (
          <>
            <ScoreRing value={displayScore} size={ringSize} />
            <div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#0a0a0a",
                }}
              >
                Score Análise
              </div>
              <div style={{ fontSize: 12, color: "#1f7a34" }}>{tier.label}</div>
            </div>
          </>
        );
      }

      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ScoreRing value={displayScore} size={ringSize} />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 0.4,
              color: "#1f7a34",
            }}
          >
            Score Análise
          </span>
        </div>
      );
    }

    // Oportunidade: score numérico nunca é exibido — só o nível categórico
    // derivado dele (ver opportunityLevel em radar-ui.tsx).
    const level = opportunityLevel(displayScore);

    if (mobile) {
      return (
        <>
          <OpportunityRing score={displayScore} size={ringSize} />
          <div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "#0a0a0a",
              }}
            >
              Oportunidade
            </div>
            <div style={{ fontSize: 12, color: level.fg }}>{level.label}</div>
          </div>
        </>
      );
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
        }}
      >
        <OpportunityRing score={displayScore} size={ringSize} />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: -0.1,
            color: level.fg,
            textAlign: "center",
          }}
        >
          {level.label}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 8.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "#8a8a85",
          }}
        >
          Oportunidade
        </span>
      </div>
    );
  }

  if (showScore) {
    return (
      <div
        style={{
          width: ringSize,
          height: ringSize,
          borderRadius: "50%",
          border: "1.5px dashed rgba(10,10,10,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#8a8a85",
          fontFamily: MONO,
          textAlign: "center",
          lineHeight: 1.2,
          flexShrink: 0,
        }}
      >
        em análise
      </div>
    );
  }

  const uploadIcon = (
    <div
      style={{
        width: ringSize,
        height: ringSize,
        borderRadius: "50%",
        border: "1.5px dashed rgba(10,10,10,0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <title>Enviar CV</title>
        <path
          d="M12 20V6M12 6l-5 5M12 6l5 5"
          stroke="#8a8a85"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );

  if (mobile) {
    return (
      <>
        {uploadIcon}
        <span
          style={{
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.4,
            color: "#8a8a85",
          }}
        >
          envie seu CV
        </span>
      </>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      {uploadIcon}
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: 0.4,
          color: "#8a8a85",
        }}
      >
        envie seu CV
      </span>
    </div>
  );
}

export type JobCardProps = {
  job: PublicJob;
  adaptarHref: string;
  showScore: boolean;
  isLoggedIn: boolean;
};

// Card full-width: ring de score dominante à direita + breakdown inline +
// chips de skill quando disponíveis. `showScore=false` cobre tanto anônimo
// quanto vaga ainda não enriquecida (score null) — o card fica idêntico,
// só sem a coluna de compatibilidade. Reaproveitado tal e qual em /radar e
// /radar-salvas (mesmas informações, mesmo componente).
export function JobCard({
  job,
  adaptarHref,
  showScore,
  isLoggedIn,
}: JobCardProps) {
  const bestAnalysisScore = job.existingApplication?.bestScore;
  const hasAnalysis = typeof bestAnalysisScore === "number";
  const hasScore = hasAnalysis || (showScore && typeof job.score === "number");
  const displayScore = hasAnalysis ? bestAnalysisScore : job.score;
  const adaptarUrl = adaptarHref.includes("?")
    ? `${adaptarHref}&jobId=${job.id}`
    : `${adaptarHref}?jobId=${job.id}`;

  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        fontFamily: GEIST,
      }}
    >
      <JobCardResponsiveStyles />
      <div className="jc-top">
        <div className="jc-headtext">
          <CompanyLogo
            name={job.company}
            logoUrl={job.companyLogoUrl}
            websiteUrl={job.companyWebsiteUrl}
          />
          <div style={{ minWidth: 0 }}>
            <JobMetaRow job={job} />
          </div>
        </div>

        {/* Badges + ring + ações agrupados à direita numa cluster só — evita
        a segunda linha quase vazia que sobrava quando os botões ficavam num
        row separado abaixo (nada pra preencher o espaço à esquerda deles).
        No mobile essa cluster empilha em coluna (ver JobCardResponsiveStyles). */}
        <div className="jc-cluster">
          <JobKeywordBadges job={job} />

          <div className="jc-ringcol">
            <ScoreIndicator
              mobile={false}
              hasScore={hasScore}
              displayScore={displayScore}
              hasAnalysis={hasAnalysis}
              showScore={showScore}
            />
          </div>

          <div
            className="jc-ringcol-mobile"
            style={{ alignItems: "center", gap: 12 }}
          >
            <ScoreIndicator
              mobile
              hasScore={hasScore}
              displayScore={displayScore}
              hasAnalysis={hasAnalysis}
              showScore={showScore}
            />
          </div>

          <div className="jc-actions">
            <SaveJobBtn
              jobId={job.id}
              initialSaved={!!job.isSaved}
              isLoggedIn={isLoggedIn}
            />
            {hasAnalysis && job.existingApplication ? (
              <AdaptBtn
                href={`/candidaturas/${job.existingApplication.id}`}
                score={bestAnalysisScore}
                variant="view"
              />
            ) : (
              <AdaptBtn href={adaptarUrl} score={hasScore ? job.score : null} />
            )}
          </div>
        </div>
      </div>

      {hasScore && job.breakdown && job.breakdownDetails && !hasAnalysis ? (
        <ScoreBreakdownPanel
          breakdown={job.breakdown}
          details={job.breakdownDetails}
        />
      ) : hasScore && job.breakdown && !hasAnalysis ? (
        // Fallback pra respostas antigas de API sem breakdownDetails (ex:
        // cache) — mantém a grade estática em vez de não mostrar nada.
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            paddingTop: 12,
            borderTop: "1px solid rgba(10,10,10,0.06)",
          }}
        >
          <MiniBar
            label="área"
            value={breakdownPct("area", job.breakdown.area)}
            compact
          />
          <MiniBar
            label="skills"
            value={breakdownPct("skills", job.breakdown.skills)}
            compact
          />
          <MiniBar
            label="senioridade"
            value={breakdownPct("seniority", job.breakdown.seniority)}
            compact
          />
          <MiniBar
            label="tecnologias"
            value={breakdownPct("technologies", job.breakdown.technologies)}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}
