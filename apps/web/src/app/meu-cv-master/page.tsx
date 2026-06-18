import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { PublicFooter } from "@/components/public-footer";
import { ProgressRing } from "@/components/progress-ring";
import { apiRequest } from "@/lib/api-request";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getMyMasterResume } from "@/lib/resumes-api";

import {
  clearAllProfileAction,
  clearProfileBlockAction,
  saveProfileBlockAction,
} from "./actions";
import { CvMasterBlock } from "./cv-master-block";
import {
  buildProfileBlockStates,
  getPrimaryGapBlockId,
  type UserProfileRecord,
} from "./profile-blocks";
import { ClearAllButton } from "./clear-all-button";
import { ResumeUploadStrip } from "./resume-upload-strip";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Meu CV Master | EarlyCV",
};

async function loadMyProfile(): Promise<UserProfileRecord | null> {
  try {
    const response = await apiRequest("GET", "/users/profile");
    if (!response.ok) {
      return null;
    }

    const body = await response.text();
    if (!body.trim()) {
      return null;
    }

    return JSON.parse(body) as UserProfileRecord;
  } catch {
    return null;
  }
}

type MeuCvMasterPageProps = {
  searchParams: Promise<{ focus?: string }>;
};

const STATE_LEGEND = [
  {
    key: "completo",
    label: "Completo",
    desc: "extração ok",
    dot: "#7aa01a",
    text: "#3a5008",
    bg: "rgba(198,255,58,0.18)",
    border: "rgba(110,150,20,0.22)",
  },
  {
    key: "lacuna",
    label: "Lacuna",
    desc: "faltam dados",
    dot: "#e0a90c",
    text: "#a07a0a",
    bg: "rgba(245,197,24,0.13)",
    border: "rgba(220,170,20,0.30)",
  },
  {
    key: "opcional",
    label: "Opcional",
    desc: "não obrigatório",
    dot: "#8a8a85",
    text: "#6a6a65",
    bg: "transparent",
    border: "rgba(10,10,10,0.10)",
  },
] as const;

export default async function MeuCvMasterPage({
  searchParams,
}: MeuCvMasterPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/meu-cv-master", user);
  if (redirectPath) redirect(redirectPath);

  const [{ focus }, profile, masterResume] = await Promise.all([
    searchParams,
    loadMyProfile(),
    getMyMasterResume(),
  ]);

  const profileData: UserProfileRecord = profile ?? {
    certificationsJson: [],
    city: null,
    contactEmail: null,
    country: null,
    currentTitle: null,
    educationJson: [],
    experiencesJson: [],
    fullName: null,
    headline: null,
    id: "draft-profile",
    languagesJson: [],
    linkedinUrl: null,
    phone: null,
    preferredLanguage: null,
    profileFieldMetaJson: {},
    profileReadinessStatus: "empty",
    profileSuggestionsJson: [],
    professionalSummary: null,
    relocationPreference: null,
    remotePreference: null,
    skillsJson: { business: [], soft: [], technical: [] },
    state: null,
    summary: null,
    targetSalaryMax: null,
    targetSalaryMin: null,
    userId: user?.id ?? "user",
    yearsExperience: null,
  };

  const blockStates = buildProfileBlockStates(profileData);
  const primaryGapBlockId = getPrimaryGapBlockId(blockStates);
  const focusedBlockId = focus ?? null;
  const gapBlocks = blockStates.filter((block) => block.hasGap);
  const gapCount = gapBlocks.length;
  const missingFieldCount = gapBlocks.reduce(
    (sum, block) => sum + block.missingCount,
    0,
  );
  const requiredBlocks = blockStates.filter((b) => !b.optional);
  const totalFields = requiredBlocks.reduce((sum, b) => sum + b.fields.length, 0);
  const missingTotal = requiredBlocks.reduce((sum, b) => sum + b.missingCount, 0);
  const profileCompletion =
    totalFields > 0
      ? Math.round(((totalFields - missingTotal) / totalFields) * 100)
      : 0;

  return (
    <PageShell>
      <main
        className="min-h-screen text-[#0a0a0a]"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        }}
      >
        <AppHeader
          userName={user?.name ?? undefined}
          userRole={user?.internalRole ?? null}
        />

        <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-[88px] md:px-8 lg:px-10">
          <div className="space-y-4">
            {/* Breadcrumb */}
            <Link
              href="/meu-perfil"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#5a5a55] transition-colors hover:text-[#0a0a0a]"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 2L4 7l5 5" />
              </svg>
              Meu Perfil
            </Link>

            {/* Cabeçalho */}
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex-1">
                <h1 className="text-[clamp(28px,3.5vw,36px)] font-medium leading-tight tracking-[-0.04em]">
                  Meu{" "}
                  <em
                    className="not-italic font-normal"
                    style={{ fontFamily: "var(--font-instrument-serif)" }}
                  >
                    CV Master.
                  </em>
                </h1>
                <p className="mt-2 max-w-[520px] text-[14px] leading-relaxed text-[#5a5a55]">
                  A IA já preencheu tudo a partir do seu PDF. Você confere e
                  corrige, nunca começa do zero. Toque num bloco para editar, só
                  ele abre.
                </p>
              </div>

              {/* Pill de completude */}
              <div className="flex shrink-0 items-center gap-3 rounded-[12px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] p-3 pr-4">
                <ProgressRing value={profileCompletion} size={80} stroke={6} />
                <div>
                  <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[#0a0a0a]">
                    {profileCompletion}% completo
                  </p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-[#8a8a85]">
                    {gapCount} lacunas
                  </p>
                </div>
              </div>
            </div>

            {/* Strip do arquivo — inline upload sem sair da página */}
            <ResumeUploadStrip
              masterResume={masterResume}
              hasFilledFields={profile !== null}
            />

            {/* Revisão: gaps summary */}
            {gapCount > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[rgba(220,170,20,0.30)] bg-[rgba(245,197,24,0.08)] px-4 py-3">
                <span className="rounded-[4px] bg-[#e0a90c] px-[5px] py-[2px] font-mono text-[9px] font-semibold text-white">
                  IA
                </span>
                <p className="text-[13px] text-[#45443e]">
                  <span className="font-medium text-[#a07a0a]">
                    {gapCount}{" "}
                    {gapCount === 1 ? "bloco com lacuna" : "blocos com lacunas"}
                  </span>{" "}
                  — {missingFieldCount}{" "}
                  {missingFieldCount === 1
                    ? "campo pendente"
                    : "campos pendentes"}
                  . Preencha para melhorar as adaptações.
                </p>
              </div>
            )}

            {/* Legenda dos estados */}
            <div className="flex flex-wrap items-center gap-5 px-1">
              {STATE_LEGEND.map((s) => (
                <div key={s.key} className="inline-flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-[9px] py-[3px] font-mono text-[10px] font-medium tracking-[0.03em]"
                    style={{
                      color: s.text,
                      background: s.bg,
                      border: `1px solid ${s.border}`,
                    }}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: s.dot }}
                    />
                    {s.label}
                  </span>
                  <span className="text-[11.5px] text-[#8a8a85]">{s.desc}</span>
                </div>
              ))}
            </div>

            {/* Blocos editáveis */}
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#8a8a85]">
                {blockStates.length} blocos
              </p>
              <ClearAllButton action={clearAllProfileAction} />
            </div>
            <div className="space-y-2">
              {blockStates.map((blockState, index) => (
                <CvMasterBlock
                  key={blockState.id}
                  index={index + 1}
                  action={saveProfileBlockAction.bind(null, blockState.id)}
                  clearAction={clearProfileBlockAction.bind(null, blockState.id)}
                  block={blockState}
                  defaultOpen={focusedBlockId === blockState.id}
                  gapHint={blockState.gapHint}
                  hasGap={blockState.hasGap}
                  isOptional={blockState.optional}
                  profile={profileData}
                  userEmail={user?.email}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </PageShell>
  );
}
