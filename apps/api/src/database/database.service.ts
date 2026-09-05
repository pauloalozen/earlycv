import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

export const EARLYCV_DATABASE_CLIENT = Symbol("EARLYCV_DATABASE_CLIENT");

type RuntimeDatabaseClient = PrismaClient;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: RuntimeDatabaseClient) {}

  get user() {
    return this.prisma.user;
  }

  get userProfile() {
    return this.prisma.userProfile;
  }

  get userRadarProfile() {
    return this.prisma.userRadarProfile;
  }

  get authAccount() {
    return this.prisma.authAccount;
  }

  get refreshToken() {
    return this.prisma.refreshToken;
  }

  get emailVerificationChallenge() {
    return this.prisma.emailVerificationChallenge;
  }

  get resume() {
    return this.prisma.resume;
  }

  get resumeTemplate() {
    return this.prisma.resumeTemplate;
  }

  get company() {
    return this.prisma.company;
  }

  get discoveredCompany() {
    return this.prisma.discoveredCompany;
  }

  get jobSource() {
    return this.prisma.jobSource;
  }

  get jobSourceAudit() {
    return this.prisma.jobSourceAudit;
  }

  get job() {
    return this.prisma.job;
  }

  get jobEnrichment() {
    return this.prisma.jobEnrichment;
  }

  get semanticFilterConfig() {
    return this.prisma.semanticFilterConfig;
  }

  get crawlerDiscardedTitle() {
    return this.prisma.crawlerDiscardedTitle;
  }

  get ingestionRun() {
    return this.prisma.ingestionRun;
  }

  get ingestionBatchRun() {
    return this.prisma.ingestionBatchRun;
  }

  get ingestionBatchItem() {
    return this.prisma.ingestionBatchItem;
  }

  get ingestionSchedulerConfig() {
    return this.prisma.ingestionSchedulerConfig;
  }

  get ingestionSchedulerLock() {
    return this.prisma.ingestionSchedulerLock;
  }

  get ingestionJob() {
    return this.prisma.ingestionJob;
  }

  get ingestionJobRun() {
    return this.prisma.ingestionJobRun;
  }

  get enrichmentBatchRun() {
    return this.prisma.enrichmentBatchRun;
  }

  get cvAdaptation() {
    return this.prisma.cvAdaptation;
  }

  get canonicalJob() {
    return this.prisma.canonicalJob;
  }

  get jobRawInput() {
    return this.prisma.jobRawInput;
  }

  get jobRequirementSet() {
    return this.prisma.jobRequirementSet;
  }

  get cvUnlock() {
    return this.prisma.cvUnlock;
  }

  get analysisCvSnapshot() {
    return this.prisma.analysisCvSnapshot;
  }

  get analysisJob() {
    return this.prisma.analysisJob;
  }

  get oAuthAttempt() {
    return this.prisma.oAuthAttempt;
  }

  get masterCvCanonicalExtraction() {
    return this.prisma.masterCvCanonicalExtraction;
  }

  get planPurchase() {
    return this.prisma.planPurchase;
  }

  get userDailyAnalysisUsage() {
    return this.prisma.userDailyAnalysisUsage;
  }

  get analysisProtectionConfig() {
    return this.prisma.analysisProtectionConfig;
  }

  get analysisProtectionEvent() {
    return this.prisma.analysisProtectionEvent;
  }

  get businessFunnelEvent() {
    return this.prisma.businessFunnelEvent;
  }

  get businessFunnelStageMetric() {
    return this.prisma.businessFunnelStageMetric;
  }

  get passwordResetToken() {
    return this.prisma.passwordResetToken;
  }

  get paymentAuditLog() {
    return this.prisma.paymentAuditLog;
  }

  get paymentRecoveryEmail() {
    return this.prisma.paymentRecoveryEmail;
  }

  get paymentRecoveryToken() {
    return this.prisma.paymentRecoveryToken;
  }

  get paymentRecoveryIgnore() {
    return this.prisma.paymentRecoveryIgnore;
  }

  get jobApplication() {
    return this.prisma.jobApplication;
  }

  get jobApplicationEvent() {
    return this.prisma.jobApplicationEvent;
  }

  get jobApplicationInterviewPrep() {
    return this.prisma.jobApplicationInterviewPrep;
  }

  get jobApplicationCoverLetter() {
    return this.prisma.jobApplicationCoverLetter;
  }

  get savedJob() {
    return this.prisma.savedJob;
  }

  get userJobRecommendation() {
    return this.prisma.userJobRecommendation;
  }

  get monitorProfileMatchJob() {
    return this.prisma.monitorProfileMatchJob;
  }

  get monitorAlertPreference() {
    return this.prisma.monitorAlertPreference;
  }

  get monitorDigest() {
    return this.prisma.monitorDigest;
  }

  get monitorDigestRecommendation() {
    return this.prisma.monitorDigestRecommendation;
  }

  get monitorDigestEvent() {
    return this.prisma.monitorDigestEvent;
  }

  get monitorAdminActionLog() {
    return this.prisma.monitorAdminActionLog;
  }

  get monitorDigestScheduleConfig() {
    return this.prisma.monitorDigestScheduleConfig;
  }

  get monitorDigestEmailContent() {
    return this.prisma.monitorDigestEmailContent;
  }

  get monitorMatchJob() {
    return this.prisma.monitorMatchJob;
  }

  get googleIndexingLog() {
    return this.prisma.googleIndexingLog;
  }

  get talentProfile() {
    return this.prisma.talentProfile;
  }

  get talentIdentitySignal() {
    return this.prisma.talentIdentitySignal;
  }

  get talentIdentityConflict() {
    return this.prisma.talentIdentityConflict;
  }

  get talentCompetency() {
    return this.prisma.talentCompetency;
  }

  get talentLanguageSkill() {
    return this.prisma.talentLanguageSkill;
  }

  get talentCertification() {
    return this.prisma.talentCertification;
  }

  get talentExperience() {
    return this.prisma.talentExperience;
  }

  get talentEducation() {
    return this.prisma.talentEducation;
  }

  get talentInteractionHistory() {
    return this.prisma.talentInteractionHistory;
  }

  // Pipeline de perfil canônico de CV (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md).
  // Fase 2: getters usados pelo módulo cv-processing/.
  get cvSource() {
    return this.prisma.cvSource;
  }

  get cvSubmission() {
    return this.prisma.cvSubmission;
  }

  get cvStructuredProfile() {
    return this.prisma.cvStructuredProfile;
  }

  get cvProcessingJob() {
    return this.prisma.cvProcessingJob;
  }

  get cvMasterDesignation() {
    return this.prisma.cvMasterDesignation;
  }

  get monitorProjectionJob() {
    return this.prisma.monitorProjectionJob;
  }

  get talentSubject() {
    return this.prisma.talentSubject;
  }

  get talentSubjectSessionSignal() {
    return this.prisma.talentSubjectSessionSignal;
  }

  get talentProfileSource() {
    return this.prisma.talentProfileSource;
  }

  // Fase 2E (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
  // seção 4) — primitivas do claim granular por fonte.
  get claimSourceGrant() {
    return this.prisma.claimSourceGrant;
  }

  get cvSourceEquivalence() {
    return this.prisma.cvSourceEquivalence;
  }

  get talentSubjectMergeEvent() {
    return this.prisma.talentSubjectMergeEvent;
  }

  get talentEducationObservation() {
    return this.prisma.talentEducationObservation;
  }

  get talentCompetencyObservation() {
    return this.prisma.talentCompetencyObservation;
  }

  get talentLanguageObservation() {
    return this.prisma.talentLanguageObservation;
  }

  get talentCertificationObservation() {
    return this.prisma.talentCertificationObservation;
  }

  get $transaction() {
    return this.prisma.$transaction.bind(this.prisma);
  }

  get $queryRaw() {
    return this.prisma.$queryRaw.bind(this.prisma);
  }

  get $executeRaw() {
    return this.prisma.$executeRaw.bind(this.prisma);
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
