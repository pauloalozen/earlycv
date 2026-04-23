import { Global, Module } from "@nestjs/common";
import { PostHogConfigService } from "./posthog-config.service";
import { PosthogClientService } from "./posthog-client.service";
import { PosthogEventExporter } from "./posthog-event-exporter.service";
import { POSTHOG_INTEGRATION_CONFIG } from "./types";
import type { PosthogIntegrationConfig } from "./types";

@Global()
@Module({
  providers: [
    {
      provide: POSTHOG_INTEGRATION_CONFIG,
      useFactory: (configService: PostHogConfigService) => {
        return configService.getConfig();
      },
      inject: [PostHogConfigService],
    },
    PostHogConfigService,
    PosthogClientService,
    PosthogEventExporter,
  ],
  exports: [
    POSTHOG_INTEGRATION_CONFIG,
    PosthogClientService,
    PosthogEventExporter,
  ],
})
export class PosthogIntegrationModule {}