import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { EnvModule } from "../config/env.module";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { EMAIL_DELIVERY_PORT } from "./email-delivery.port";
import { FakeEmailDeliveryService } from "./fake-email-delivery.service";
import { GoogleStrategy } from "./strategies/google.strategy";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LinkedinStrategy } from "./strategies/linkedin.strategy";
import { LocalStrategy } from "./strategies/local.strategy";

@Module({
  imports: [EnvModule, DatabaseModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    FakeEmailDeliveryService,
    {
      provide: EMAIL_DELIVERY_PORT,
      useExisting: FakeEmailDeliveryService,
    },
    JwtStrategy,
    LocalStrategy,
    GoogleStrategy,
    LinkedinStrategy,
  ],
  exports: [AuthService, FakeEmailDeliveryService, EMAIL_DELIVERY_PORT],
})
export class AuthModule {}
