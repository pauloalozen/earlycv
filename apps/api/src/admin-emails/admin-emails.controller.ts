import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminEmailsService, assertTemplateKey } from "./admin-emails.service";
// Imports de VALOR (não `import type`) de propósito — mesmo motivo de
// admin-monitor.controller.ts: DTOs de @Query/@Body precisam disso pro Nest
// reflectir o metatype real (ValidationPipe global), senão todo campo vira
// "should not exist".
// biome-ignore-start lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { ListEmailDispatchesQueryDto } from "./dto/list-email-dispatches-query.dto";
import { EmailsPageQueryDto } from "./dto/page-query.dto";
import { RecoverPurchaseConfirmationsDto } from "./dto/recover-purchase-confirmations.dto";
import { SendTestEmailTemplateDto } from "./dto/send-test-email-template.dto";
import { UpdateEmailSettingsDto } from "./dto/update-email-settings.dto";
import { UpdateEmailTemplateDto } from "./dto/update-email-template.dto";
// biome-ignore-end lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype

// Toda regra de negócio vive nos serviços do dispatch (nunca aqui). Leitura e
// edição liberadas a admin/superadmin, como as demais abas de e-mail.
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/emails")
export class AdminEmailsController {
  constructor(
    @Inject(AdminEmailsService) private readonly service: AdminEmailsService,
  ) {}

  @Get("overview")
  overview() {
    return this.service.overview();
  }

  @Get("settings")
  getSettings() {
    return this.service.getSettings();
  }

  @Post("settings")
  updateSettings(
    @Body() body: UpdateEmailSettingsDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.updateSettings(admin.id, body);
  }

  @Get("templates")
  listTemplates() {
    return this.service.listTemplates();
  }

  @Post("templates/:key/preview")
  previewTemplate(
    @Param("key") key: string,
    @Body() body: UpdateEmailTemplateDto,
  ) {
    return this.service.previewTemplate(assertTemplateKey(key), body);
  }

  @Post("templates/:key/send-test")
  sendTestTemplate(
    @Param("key") key: string,
    @Body() body: SendTestEmailTemplateDto,
  ) {
    return this.service.sendTestTemplate(
      assertTemplateKey(key),
      body.recipientEmail,
    );
  }

  @Post("templates/:key/reset")
  resetTemplate(
    @Param("key") key: string,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.resetTemplate(admin.id, assertTemplateKey(key));
  }

  @Post("templates/:key")
  updateTemplate(
    @Param("key") key: string,
    @Body() body: UpdateEmailTemplateDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.updateTemplate(admin.id, assertTemplateKey(key), body);
  }

  @Get("dispatches")
  listDispatches(@Query() query: ListEmailDispatchesQueryDto) {
    return this.service.listDispatches(query);
  }

  @Get("dispatches/:id")
  getDispatch(@Param("id") id: string) {
    return this.service.getDispatch(id);
  }

  @Get("suppressions")
  listSuppressions(@Query() query: EmailsPageQueryDto) {
    return this.service.listSuppressions(query);
  }

  @Get("purchase-confirmations/missing")
  missing(@Query() query: RecoverPurchaseConfirmationsDto) {
    return this.service.missingPurchaseConfirmations(query.sinceHours);
  }

  @Post("purchase-confirmations/recover")
  recover(@Body() body: RecoverPurchaseConfirmationsDto) {
    return this.service.recoverPurchaseConfirmations(body.sinceHours);
  }
}
