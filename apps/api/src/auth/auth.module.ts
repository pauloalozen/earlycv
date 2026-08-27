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
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EMAIL_DELIVERY_PORT } from "./email-delivery.port";
import { FakeEmailDeliveryService } from "./fake-email-delivery.service";
import { OAuthAttemptService } from "./oauth-attempt.service";
import { captureOAuthSignupContextMiddleware } from "./oauth-signup-context";
import { ResendEmailDeliveryService } from "./resend-email-delivery.service";
import { GoogleStrategy } from "./strategies/google.strategy";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";

const useResend =
  Boolean(process.env.RESEND_API_KEY) && process.env.APP_ENV === "production";

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    AnalysisObservabilityModule,
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    FakeEmailDeliveryService,
    ResendEmailDeliveryService,
    {
      provide: EMAIL_DELIVERY_PORT,
      useExisting: useResend
        ? ResendEmailDeliveryService
        : FakeEmailDeliveryService,
    },
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    OAuthAttemptService,
  ],
  exports: [AuthService, FakeEmailDeliveryService, EMAIL_DELIVERY_PORT],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(captureOAuthSignupContextMiddleware)
      .forRoutes({ path: "auth/google/start", method: RequestMethod.GET });
  }
}
