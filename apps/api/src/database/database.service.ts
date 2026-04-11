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

  get cvAdaptation() {
    return this.prisma.cvAdaptation;
  }

  get planPurchase() {
    return this.prisma.planPurchase;
  }

  get passwordResetToken() {
    return this.prisma.passwordResetToken;
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
