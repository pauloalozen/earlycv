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

  get jobSource() {
    return this.prisma.jobSource;
  }

  get job() {
    return this.prisma.job;
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

  get $transaction() {
    return this.prisma.$transaction.bind(this.prisma);
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
