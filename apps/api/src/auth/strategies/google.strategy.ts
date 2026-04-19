import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import {
  type Profile as GoogleProfile,
  Strategy,
} from "passport-google-oauth20";

import { APP_ENV, type AppEnv } from "../../config/env.module";
import type { SocialProfileInput } from "../auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(@Inject(APP_ENV) env: AppEnv) {
    super({
      callbackURL: env.GOOGLE_CALLBACK_URL,
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      scope: ["email", "profile"],
      state: false,
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: GoogleProfile,
  ): Promise<SocialProfileInput> {
    const email = profile.emails?.[0]?.value ?? profile._json.email;

    if (!email) {
      throw new UnauthorizedException("google account email is required");
    }

    return {
      provider: "google",
      providerAccountId: profile.id,
      email,
      name: profile.displayName || profile._json.name || email,
      emailVerified:
        profile.emails?.[0]?.verified ?? profile._json.email_verified ?? false,
    };
  }
}
