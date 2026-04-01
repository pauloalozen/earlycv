import { Inject, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { APP_ENV, type AppEnv } from "../../config/env.module";
import { AuthService } from "../auth.service";

type AccessPayload = {
  sub: string;
  type: "access";
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(APP_ENV) env: AppEnv,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: AccessPayload) {
    return this.authService.getCurrentUser(payload.sub);
  }
}
