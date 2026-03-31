import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async getByUserId(userId: string) {
    const profile = await this.database.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException("profile not found");
    }

    return profile;
  }

  async update(userId: string, dto: UpdateProfileDto) {
    await this.getByUserId(userId);

    return this.database.userProfile.update({
      where: { userId },
      data: dto,
    });
  }
}
