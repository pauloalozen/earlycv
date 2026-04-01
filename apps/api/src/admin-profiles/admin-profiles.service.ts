import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type { UpdateAdminProfileDto } from "./dto/update-admin-profile.dto";

@Injectable()
export class AdminProfilesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  list() {
    return this.database.userProfile.findMany({
      where: {
        user: {
          isStaff: false,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async getByUserId(userId: string) {
    return this.loadProductProfileByUserId(userId);
  }

  async update(userId: string, dto: UpdateAdminProfileDto) {
    await this.loadProductProfileByUserId(userId);

    return this.database.userProfile.update({
      where: { userId },
      data: dto,
    });
  }

  private async loadProductProfileByUserId(userId: string) {
    const profile = await this.database.userProfile.findFirst({
      where: {
        userId,
        user: {
          isStaff: false,
        },
      },
    });

    if (!profile) {
      throw new NotFoundException("profile not found");
    }

    return profile;
  }
}
