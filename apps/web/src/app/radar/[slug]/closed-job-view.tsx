import type { Metadata } from "next";
import Link from "next/link";
import { CompanyLogo } from "@/app/radar/company-logo";
import { RADAR_AREA_LABELS } from "@/app/radar/radar-ui";
import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import type { AppSessionUser } from "@/lib/app-session";
import { toCompanySlug } from "@/lib/company-slug";
import type { ClosedPublicJob, PublicJob } from "@/lib/public-jobs-api";
import { SimCard } from "./job-detail";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF =
  "var(--font-instrument-serif), 'Instrument Serif', Georgia, serif";

// Vaga encerrada não é conteúdo indexável (o Google já é avisado da remoção
// na inativação), mas os links dela continuam valendo pro crawler seguir.
export function buildClosedJobMetadata(job: ClosedPublicJob): Metadata {
  return {
    title: `Vaga encerrada — ${job.title} — ${job.company}`,
    description: `A vaga de ${job.title} na ${job.company} foi encerrada. Veja outras vagas abertas no EarlyCV.`,
    robots: { index: false, follow: true },
  };
}

// Página da vaga que saiu do radar (fechada na fonte ou retirada). Existe
// pra que links antigos (candidaturas, vagas salvas, Alerta, e-mails) deixem
// claro o que aconteceu em vez de cair no 404 genérico. Sem descrição, link
// de origem nem CTA de candidatura/análise.
export function ClosedJobView({
  job,
  similarJobs,
  user,
}: {
  job: ClosedPublicJob;
  similarJobs: PublicJob[];
  user: AppSessionUser | null;
}) {
  const lastSeenDate = new Date(job.lastSeenAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const links: Array<{ href: string; label: string }> = [
    {
      href: `/radar/empresa/${toCompanySlug(job.company)}`,
      label: `Vagas abertas na ${job.company}`,
    },
  ];
  if (job.dominantArea) {
    links.push({
      href: `/radar/area/${job.dominantArea.toLowerCase()}`,
      label: `Vagas de ${RADAR_AREA_LABELS[job.dominantArea] ?? job.dominantArea}`,
    });
  }
  if (user) {
    links.push({ href: "/candidaturas", label: "Minhas candidaturas" });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 80% 50% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        fontFamily: GEIST,
        color: "#0a0a0a",
      }}
    >
      <PublicNavBar
        hideHowItWorksLink
        hideJobsLink
        fixed
        userName={user?.name}
        userRole={user?.internalRole}
        guestCtaLabel="Criar conta grátis →"
        guestCtaHref="/entrar?tab=cadastrar&ctx=radar"
      />

      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "108px clamp(16px,4vw,48px) 80px",
        }}
      >
        <nav
          aria-label="Breadcrumb"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#8a8a85",
            letterSpacing: 0.3,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
          }}
        >
          <Link
            href="/radar"
            style={{ color: "#5a5a55", textDecoration: "none", flexShrink: 0 }}
          >
            Vagas
          </Link>
          <span style={{ color: "#c8c6bf", flexShrink: 0 }}>›</span>
          <span
            style={{
              color: "#0a0a0a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {job.title}
          </span>
        </nav>

        <header style={{ marginBottom: 28, maxWidth: 760 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 22,
            }}
          >
            <CompanyLogo
              name={job.company}
              logoUrl={job.companyLogoUrl}
              websiteUrl={job.companyWebsiteUrl}
              size={44}
              borderRadius={10}
              fontSize={13}
            />
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                  marginBottom: 2,
                }}
              >
                {job.company}
              </div>
              {job.location ? (
                <div style={{ fontSize: 12, color: "#6a6560" }}>
                  {job.location}
                </div>
              ) : null}
            </div>
          </div>

          <h1
            style={{
              fontSize: "clamp(1.75rem,4vw,2.75rem)",
              fontWeight: 500,
              letterSpacing: -1.6,
              lineHeight: 1.05,
              color: "#8a8a85",
              margin: 0,
            }}
          >
            {job.title}
          </h1>
        </header>

        <section
          style={{
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.10)",
            borderRadius: 14,
            padding: "24px clamp(18px,3vw,28px)",
            maxWidth: 760,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1.2,
              color: "#3a3a38",
              background: "rgba(10,10,10,0.06)",
              borderRadius: 999,
              padding: "5px 11px",
              marginBottom: 14,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#a8a6a0",
              }}
            />
            VAGA ENCERRADA
          </span>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: -0.6,
              margin: "0 0 10px",
            }}
          >
            Esta vaga{" "}
            <em style={{ fontFamily: SERIF, fontWeight: 400 }}>
              não está mais disponível.
            </em>
          </h2>
          <p
            style={{
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "#45443e",
              margin: "0 0 18px",
            }}
          >
            Ela saiu da página de carreiras da {job.company}: o processo foi
            encerrado ou a vaga foi retirada pela empresa. Vista pela última vez
            em {lastSeenDate}.
            {user
              ? " Se você já tinha uma candidatura para ela, nada foi apagado — tudo continua em Candidaturas."
              : null}
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "12px 18px",
            }}
          >
            <Link
              href="/radar"
              style={{
                background: "#0a0a0a",
                color: "#fafaf6",
                borderRadius: 9,
                padding: "11px 18px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Ver vagas abertas →
            </Link>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  fontFamily: MONO,
                  fontSize: 11.5,
                  color: "#3a3a38",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textDecorationColor: "rgba(10,10,10,0.2)",
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>

        {similarJobs.length > 0 ? (
          <div style={{ marginTop: 40 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.4,
                color: "#8a8a85",
                marginBottom: 5,
                fontWeight: 500,
              }}
            >
              VAGAS ABERTAS
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -0.6,
                marginBottom: 16,
              }}
            >
              Outras vagas recentes
            </div>
            <style>{`
              .closed-job-similar-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
              @media (max-width: 900px) {
                .closed-job-similar-grid { grid-template-columns: 1fr; }
              }
            `}</style>
            <div className="closed-job-similar-grid">
              {similarJobs.map((similar) => (
                <SimCard key={similar.id} job={similar} showMatchLock={!user} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <PublicFooter
        tagline="Tudo que você precisa para conquistar mais entrevistas, em um só lugar."
        ctaLabel="Criar minha conta grátis agora →"
        ctaHref="/entrar?tab=cadastrar&ctx=radar"
      />
    </main>
  );
}
