import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import {
  type Profile as LinkedInProfile,
  Strategy,
  type StrategyOption,
} from "passport-linkedin-oauth2";

import { APP_ENV, type AppEnv } from "../../config/env.module";
import type { SocialProfileInput } from "../auth.service";

@Injectable()
export class LinkedinStrategy extends PassportStrategy(Strategy, "linkedin") {
  constructor(@Inject(APP_ENV) env: AppEnv) {
    super({
      callbackURL: env.LINKEDIN_CALLBACK_URL,
      clientID: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
      scope: ["r_liteprofile", "r_emailaddress"],
      state: false,
    } as StrategyOption & { state: boolean });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: LinkedInProfile,
  ): Promise<SocialProfileInput> {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException("linkedin account email is required");
    }

    return {
      provider: "linkedin",
      providerAccountId: profile.id,
      email,
      name:
        profile.displayName ||
        `${profile.name.givenName} ${profile.name.familyName}`.trim() ||
        email,
      emailVerified: true,
    };
  }
}
