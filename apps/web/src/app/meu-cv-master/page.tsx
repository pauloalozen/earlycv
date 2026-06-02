import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/api-request";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getMyMasterResume } from "@/lib/resumes-api";

import { saveProfileBlockAction } from "./actions";
import { CvMasterBlock } from "./cv-master-block";
import {
  buildProfileBlockStates,
  getPrimaryGapBlockId,
  type UserProfileRecord,
} from "./profile-blocks";

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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type MeuCvMasterPageProps = {
  searchParams: Promise<{ focus?: string }>;
};

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
  const statusCompletion =
    profileData.profileReadinessStatus === "ready"
      ? 100
      : profileData.profileReadinessStatus === "partial"
        ? 80
        : 0;
  const suggestionCount = Array.isArray(profileData.profileSuggestionsJson)
    ? profileData.profileSuggestionsJson.length
    : 0;

  return (
    <PageShell>
      <main className="min-h-screen bg-[#FAFAFA] text-[#111111]">
        <AppHeader
          userName={user?.name ?? undefined}
          userRole={user?.internalRole ?? null}
        />

        <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-[88px] md:px-8 lg:px-10">
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-[1fr_0.75fr]">
              <Card className="space-y-5">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                    Meu CV Master
                  </p>
                  <h1 className="mt-3 text-[clamp(28px,3.5vw,40px)] font-medium tracking-[-0.06em] text-[#111111]">
                    Revisão e edição do perfil
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-[#666666] md:text-base">
                    Revise blocos fechados, abra apenas o que precisa de correção e mantenha o CV Master como base única do seu perfil.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-[#E5E5E5] bg-[#FAFAFA] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                      Revisão
                    </p>
                    <p className="mt-2 text-lg font-medium tracking-[-0.03em] text-[#111111]">
                      {gapCount > 0
                        ? `${gapCount} blocos com lacunas`
                        : "Perfil pronto para conferência"}
                    </p>
                    <p className="mt-1 text-sm text-[#666666]">
                      {gapCount > 0
                        ? `${missingFieldCount} campos pendentes em revisão.`
                        : "Nenhuma lacuna aberta no momento."}
                    </p>
                  </div>

                  <div className="rounded-[18px] border border-[#E5E5E5] bg-[#FAFAFA] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                      Status do CV
                    </p>
                    <p className="mt-2 text-lg font-medium tracking-[-0.03em] text-[#111111]">
                      {masterResume ? masterResume.title : "Nenhum CV Master ativo"}
                    </p>
                    <p className="mt-1 text-sm text-[#666666]">
                      {masterResume
                        ? (masterResume.sourceFileName ?? "Arquivo sem nome de origem")
                        : "Vá para o fluxo de upload para cadastrar o PDF base."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0F0F0] pt-4">
                  <div>
                    <p className="text-sm text-[#666666]">Atualizado em</p>
                    <p className="text-base font-medium text-[#111111]">{formatDateTime(masterResume?.updatedAt)}</p>
                  </div>
                  <Link
                    href="/cv-base"
                    className="inline-flex h-11 items-center rounded-full border border-[#E5E5E5] bg-white px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#111111] transition-colors hover:bg-[#F5F5F5]"
                  >
                    Abrir CV Base
                  </Link>
                </div>
              </Card>

              <Card variant={gapCount > 0 ? "muted" : "default"} className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                    Status do perfil
                  </p>
                  <h2 className="mt-2 text-[28px] font-medium tracking-[-0.05em] text-[#111111]">
                    Perfil {statusCompletion}% completo
                  </h2>
                  <p className="mt-1 text-sm text-[#666666]">
                    {suggestionCount} sugestões
                  </p>
                </div>

                <div className="rounded-[18px] border border-[#E5E5E5] bg-white p-4">
                  <p className="text-sm text-[#666666]">
                    Clique para abrir a edição já no bloco com lacuna.
                  </p>
                  <p className="mt-2 text-base font-medium text-[#111111]">
                    {blockStates.find((block) => block.id === primaryGapBlockId)?.title ??
                      "Primeiro bloco com lacuna"}
                  </p>
                  <Link
                    href={
                      primaryGapBlockId
                        ? `/meu-cv-master?focus=${primaryGapBlockId}`
                        : "/meu-cv-master"
                    }
                    className="mt-4 inline-flex h-11 items-center rounded-full bg-[#111111] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#1A1A1A]"
                  >
                    Abrir bloco sugerido
                  </Link>
                </div>
              </Card>
            </section>

            <section className="space-y-4">
              {blockStates.map((blockState) => (
                <CvMasterBlock
                  key={blockState.id}
                  action={saveProfileBlockAction.bind(null, blockState.id)}
                  block={blockState}
                  defaultOpen={focusedBlockId === blockState.id}
                  gapHint={blockState.gapHint}
                  hasGap={blockState.hasGap}
                  profile={profileData}
                />
              ))}
            </section>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
