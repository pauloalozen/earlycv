import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

@Injectable()
export class IngestionLockRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async acquire(lockId: string, owner: string, ttlMs: number) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    const existing = await this.database.ingestionSchedulerLock.findUnique({
      where: { id: lockId },
    });

    if (existing && existing.expiresAt > now && existing.owner !== owner) {
      return false;
    }

    await this.database.ingestionSchedulerLock.upsert({
      where: { id: lockId },
      update: {
        expiresAt,
        lockedAt: now,
        owner,
      },
      create: {
        expiresAt,
        id: lockId,
        lockedAt: now,
        owner,
      },
    });

    return true;
  }

  async release(lockId: string, owner: string) {
    const existing = await this.database.ingestionSchedulerLock.findUnique({
      where: { id: lockId },
    });

    if (!existing || existing.owner !== owner) {
      return;
    }

    await this.database.ingestionSchedulerLock.delete({ where: { id: lockId } });
  }
}
