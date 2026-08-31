import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { AnalysisObservabilityModule } from "../analysis-observability/analysis-observability.module";
import { EnvModule } from "../config/env.module";
import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { OAuthAttemptService } from "./oauth-attempt.service";
import { captureOAuthSignupContextMiddleware } from "./oauth-signup-context";
import { GoogleStrategy } from "./strategies/google.strategy";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    AnalysisObservabilityModule,
    EmailModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    OAuthAttemptService,
  ],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(captureOAuthSignupContextMiddleware)
      .forRoutes({ path: "auth/google/start", method: RequestMethod.GET });
  }
}
