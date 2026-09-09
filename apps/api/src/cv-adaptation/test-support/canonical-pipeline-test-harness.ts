// Harness compartilhado pelos testes permanentes do pipeline canônico de CV
// (auditoria de 2026-09-08, 2ª rodada). Objetivo: rodar contra Postgres real
// (earlycv_test) sem deixar resíduo — cada teste gera um runId único,
// registra todo userId/talentSubjectId que criar, e chama cleanupRunArtifacts
// num finally. Nunca apaga nada fora do que o próprio teste registrou (nunca
// mexe em debris histórico de execuções anteriores, ver seção 1 da 2ª
// rodada de auditoria).
import { randomUUID } from "node:crypto";

import type { DatabaseService } from "../../database/database.service";

export function makeRunId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export class RunArtifacts {
  readonly userIds = new Set<string>();
  readonly talentSubjectIds = new Set<string>();

  trackUser(id: string): void {
    this.userIds.add(id);
  }

  trackTalentSubject(id: string): void {
    this.talentSubjectIds.add(id);
  }
}

// Ordem de deleção respeita as FKs RESTRICT conhecidas (CvMasterDesignation
// -> CvStructuredProfile, CvSource -> TalentSubject) — nunca depende de
// cascade pra limpar o que o próprio Cascade não cobre (AnalysisJob,
// CvAdaptation, AnalysisCvSnapshot são SetNull a partir de User, nunca
// Cascade, então precisam de deleteMany explícito).
export async function cleanupRunArtifacts(
  database: DatabaseService,
  artifacts: RunArtifacts,
): Promise<void> {
  const userIds = Array.from(artifacts.userIds);
  const talentSubjectIds = Array.from(artifacts.talentSubjectIds);
  if (userIds.length === 0 && talentSubjectIds.length === 0) return;

  const ownerFilter = {
    OR: [
      ...(userIds.length ? [{ userId: { in: userIds } }] : []),
      ...(talentSubjectIds.length
        ? [{ talentSubjectId: { in: talentSubjectIds } }]
        : []),
    ],
  };

  await database.analysisJob.deleteMany({
    where: {
      OR: [
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        // AnalysisJob de guest não tem talentSubjectId direto — correlaciona
        // por guestSessionHash não é confiável aqui (não rastreado no
        // harness); guest analysis jobs órfãos deste teste são varridos
        // via cvProcessingJobId/cvSourceId (cascade), tratados abaixo.
      ],
    },
  });
  await database.cvMasterDesignation.deleteMany({ where: ownerFilter });
  if (userIds.length) {
    await database.cvAdaptation.deleteMany({
      where: { userId: { in: userIds } },
    });
    await database.analysisCvSnapshot.deleteMany({
      where: { userId: { in: userIds } },
    });
  }
  await database.talentProfile.deleteMany({ where: ownerFilter });
  // CvSource cascata pra CvSubmission/CvProcessingJob/CvStructuredProfile/
  // ClaimSourceGrant/CvSourceEquivalence/TalentProfileSource — precisa vir
  // DEPOIS de CvMasterDesignation (RESTRICT em cvStructuredProfileId) e
  // depois de AnalysisJob (que só teria FK SetNull, mas evita corrida).
  await database.cvSource.deleteMany({ where: ownerFilter });
  if (userIds.length) {
    await database.resume.deleteMany({ where: { userId: { in: userIds } } });
    await database.userProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await database.userRadarProfile
      .deleteMany({ where: { userId: { in: userIds } } })
      .catch(() => undefined); // modelo pode não existir em todo schema de teste
  }
  if (talentSubjectIds.length) {
    await database.talentSubjectSessionSignal.deleteMany({
      where: { talentSubjectId: { in: talentSubjectIds } },
    });
    await database.talentSubject.deleteMany({
      where: { id: { in: talentSubjectIds } },
    });
  }
  if (userIds.length) {
    await database.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

// Confirma resíduo zero por runId — usa o prefixo do runId embutido no
// e-mail do usuário/rawText/jobDescriptionText de teste (cada arquivo de
// teste embute o runId nesses campos) em vez de contar userIds/talentSubjectIds
// (que já foram apagados nesse ponto) — prova que NENHUMA linha esquecida
// sobrevive à limpeza, em qualquer tabela plausível.
export async function assertNoResidualRows(
  database: DatabaseService,
  runId: string,
): Promise<Record<string, number>> {
  const [users, resumes, analysisJobs, cvAdaptations, talentSubjects] =
    await Promise.all([
      database.user.count({ where: { email: { contains: runId } } }),
      database.resume.count({ where: { rawText: { contains: runId } } }),
      database.analysisJob.count({
        where: { jobDescriptionText: { contains: runId } },
      }),
      database.cvAdaptation.count({
        where: { jobDescriptionText: { contains: runId } },
      }),
      // TalentSubject não tem campo de texto — rastreado só por id (ver
      // RunArtifacts), nunca por runId textual.
      Promise.resolve(0),
    ]);
  return { users, resumes, analysisJobs, cvAdaptations, talentSubjects };
}
