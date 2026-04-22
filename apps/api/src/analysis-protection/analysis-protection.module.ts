import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import {
  ANALYSIS_CONFIG_SERVICE_OPTIONS,
  AnalysisConfigService,
} from "./analysis-config.service";
import { AnalysisDedupeCacheService } from "./analysis-dedupe-cache.service";
import { AnalysisProtectionFacade } from "./analysis-protection.facade";
import { AnalysisRateLimitService } from "./analysis-rate-limit.service";
import { AnalysisTelemetryService } from "./analysis-telemetry.service";
import { AnalysisUsagePolicyService } from "./analysis-usage-policy.service";
import { ProtectedAiProviderGateway } from "./protected-ai-provider.gateway";
import { InMemoryOperationalStoreAdapter } from "./store/in-memory-operational-store.adapter";
import { ANALYSIS_OPERATIONAL_STORE } from "./store/operational-store.port";
import { TurnstileVerificationService } from "./turnstile-verification.service";

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: ANALYSIS_OPERATIONAL_STORE,
      useFactory: () => new InMemoryOperationalStoreAdapter(),
    },
    {
      provide: ANALYSIS_CONFIG_SERVICE_OPTIONS,
      useValue: {},
    },
    AnalysisConfigService,
    AnalysisRateLimitService,
    AnalysisDedupeCacheService,
    AnalysisUsagePolicyService,
    TurnstileVerificationService,
    ProtectedAiProviderGateway,
    AnalysisTelemetryService,
    AnalysisProtectionFacade,
  ],
  exports: [AnalysisConfigService, AnalysisProtectionFacade],
})
export class AnalysisProtectionModule {}
