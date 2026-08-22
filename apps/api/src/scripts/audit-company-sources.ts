// Saneamento de fontes: varre Company.websiteUrl/careersUrl e
// JobSource.sourceUrl e grava em JobSourceAudit qualquer caso onde a URL
// nao tem relacao textual plausivel com o nome da empresa dona do registro
// — o bug que motivou isso foi "VERACEL" (usina de celulose) com
// careersUrl apontando pro board de vagas da "Vercel" (empresa de infra).
//
// So LEITURA + upsert na fila de revisao (JobSourceAudit) — nao mexe em
// Company/JobSource/Job. A aplicacao de qualquer correcao e feita por
// apply-company-source-audit.ts, e so depois de voce marcar status=approved
// nas linhas que fizerem sentido.
//
// Tiers:
//   confirmed - a URL bate com o nome de OUTRA Company que ja existe no
//               nosso banco (alta confianca: sabemos o dono real — o apply
//               pode reatribuir Job/JobSource pra ela sem precisar criar
//               empresa nova).
//   high      - a URL nao bate com o nome da empresa nem com nenhuma outra
//               Company nossa (provavelmente errada, mas nao sabemos o
//               dono certo — so da pra desativar a fonte errada).
//   review    - similaridade ambigua (0.4-0.6, incluindo empate entre
//               mais de uma Company nossa candidata a dona) — pode ser
//               falso positivo (nome curto, sigla) ou um erro real menos
//               obvio; decida manualmente antes de aprovar.
//
// Importante: o tier NAO diz nada sobre a Company do achado ser "gringa"
// ou fora do escopo do produto — ela continua sendo um alvo valido pra
// descoberta encontrar a fonte real dela depois. Quem pode ser
// irrelevante pro radar BR e o DONO REAL da URL errada (ex: Anthropic,
// DeepL) — e so nesse caso pontual o apply remove em vez de reatribuir
// as vagas ja importadas (ver apply-company-source-audit.ts).
//
// Idempotente: roda de novo quantas vezes quiser, so grava achado novo ou
// atualiza um "pending" existente — nunca sobrescreve uma linha que voce ja
// revisou (approved/rejected/applied).
//
//   npm run audit:company-sources --workspace @earlycv/api

import { PrismaClient } from "@prisma/client";

import {
  companyNameTokens,
  isStrictLiteralSlugHost,
  MATCH_THRESHOLD,
  normToken,
  scoreUrlAgainstCompany,
} from "../ingestion/company-source-audit-heuristics";

const REVIEW_THRESHOLD = 0.4;

type CompanyRow = {
  id: string;
  name: string;
  websiteUrl: string | null;
  careersUrl: string | null;
};

type CandidateField = {
  field: "websiteUrl" | "careersUrl" | "sourceUrl";
  url: string;
  jobSourceId: string | null;
};

function tierFor(score: number): "confirmed" | "high" | "review" | null {
  if (score >= REVIEW_THRESHOLD && score < MATCH_THRESHOLD) return "review";
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const companies: CompanyRow[] = await prisma.company.findMany({
      select: { id: true, name: true, websiteUrl: true, careersUrl: true },
    });
    const jobSources = await prisma.jobSource.findMany({
      select: { id: true, companyId: true, sourceUrl: true },
    });

    const jobSourcesByCompany = new Map<string, typeof jobSources>();
    for (const js of jobSources) {
      const list = jobSourcesByCompany.get(js.companyId) ?? [];
      list.push(js);
      jobSourcesByCompany.set(js.companyId, list);
    }

    // Indice nome-token -> empresas donas, pra achar o "tier confirmed":
    // uma URL cujo slug bate com o nome de outra Company nossa. Indexa
    // tanto as palavras individuais do nome ("Grupo Pão de Açúcar" ->
    // "grupo"/"pao"/"acucar", sem stopword) quanto o nome inteiro
    // normalizado e colado ("C&A Brasil" -> "cabrasil") — o slug de um ATS
    // as vezes e a junção do nome todo (sem espaço) em vez de uma palavra
    // isolada, e so a tokenizacao por palavra perderia esse caso (ex:
    // "brasil" e stopword, mas o slug real da C&A e literalmente
    // "cabrasil").
    const tokenIndex = new Map<string, CompanyRow[]>();
    function indexToken(token: string, company: CompanyRow) {
      if (!token || token.length < 3) return;
      const list = tokenIndex.get(token) ?? [];
      if (!list.includes(company)) list.push(company);
      tokenIndex.set(token, list);
    }
    for (const company of companies) {
      for (const token of companyNameTokens(company.name)) {
        indexToken(token, company);
      }
      indexToken(normToken(company.name), company);
    }

    let found = 0;
    let created = 0;
    let updated = 0;
    let skippedReviewed = 0;

    for (const company of companies) {
      const candidates: CandidateField[] = [];
      if (company.websiteUrl) {
        candidates.push({
          field: "websiteUrl",
          url: company.websiteUrl,
          jobSourceId: null,
        });
      }
      if (company.careersUrl) {
        candidates.push({
          field: "careersUrl",
          url: company.careersUrl,
          jobSourceId: null,
        });
      }
      for (const js of jobSourcesByCompany.get(company.id) ?? []) {
        candidates.push({
          field: "sourceUrl",
          url: js.sourceUrl,
          jobSourceId: js.id,
        });
      }

      for (const candidate of candidates) {
        const { score, matchedToken } = scoreUrlAgainstCompany(
          candidate.url,
          company.name,
        );
        if (score >= MATCH_THRESHOLD) continue; // parece correto, nada a fazer

        // Sem nenhum token de identidade extraivel na URL (plataforma
        // desconhecida sem padrao mapeado) e score=0 sem match nenhum: nao
        // da pra afirmar nada com confianca — nao gera achado.
        if (score === 0 && matchedToken === null) continue;

        let tier: "confirmed" | "high" | "review" = "high";
        let suspectedOwnerId: string | null = null;
        let suspectedOwnerName: string | null = null;

        if (matchedToken) {
          const owners = (tokenIndex.get(matchedToken) ?? []).filter(
            (owner) => owner.id !== company.id,
          );
          if (owners.length === 1) {
            tier = "confirmed";
            suspectedOwnerId = owners[0]!.id;
            suspectedOwnerName = owners[0]!.name;
          } else if (owners.length > 1) {
            // Ambiguo (o slug bate com mais de uma empresa nossa) — melhor
            // deixar pra revisao humana decidir qual delas e a dona real.
            tier = "review";
            suspectedOwnerName = owners.map((o) => o.name).join(" | ");
          }
        }

        if (tier === "high") {
          // Sem cruzamento com outra Company nossa: so vira achado se a
          // plataforma tiver slug confiavelmente literal (ver
          // STRICT_LITERAL_SLUG_HOSTS) — nas BR (Gupy/Pandape/Teamtailor/
          // Solides) o subdominio costuma ser sigla/slogan/nome de grupo, e
          // baixa semelhanca textual sozinha gera falso positivo demais
          // pra virar item de fila.
          const host = safeHost(candidate.url);
          if (!host || !isStrictLiteralSlugHost(host)) continue;

          const reviewTier = tierFor(score);
          if (reviewTier) tier = reviewTier;
          // score < REVIEW_THRESHOLD e sem confirmed: mantem "high" (sem
          // nenhuma relacao textual plausivel).
        }

        found += 1;

        const existing = await prisma.jobSourceAudit.findUnique({
          where: {
            companyId_field_currentUrl: {
              companyId: company.id,
              field: candidate.field,
              currentUrl: candidate.url,
            },
          },
        });

        if (existing) {
          if (existing.status !== "pending") {
            skippedReviewed += 1;
            continue;
          }
          await prisma.jobSourceAudit.update({
            where: { id: existing.id },
            data: {
              jobSourceId: candidate.jobSourceId,
              tier,
              confidence: score,
              suspectedOwnerId,
              suspectedOwnerName,
            },
          });
          updated += 1;
          continue;
        }

        await prisma.jobSourceAudit.create({
          data: {
            companyId: company.id,
            jobSourceId: candidate.jobSourceId,
            field: candidate.field,
            currentUrl: candidate.url,
            tier,
            confidence: score,
            suspectedOwnerId,
            suspectedOwnerName,
          },
        });
        created += 1;
      }
    }

    console.log(
      `[audit-company-sources] ${found} achado(s) — ${created} novo(s), ${updated} atualizado(s) (pending), ${skippedReviewed} ja revisado(s) (mantidos como estao).`,
    );
    console.log(
      "[audit-company-sources] revise com: SELECT * FROM \"JobSourceAudit\" WHERE status='pending' ORDER BY tier, confidence;",
    );
  } finally {
    await prisma.$disconnect();
  }
}

function safeHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

main().catch((error: unknown) => {
  console.error("[audit-company-sources] falhou:", error);
  process.exitCode = 1;
});
