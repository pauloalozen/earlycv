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
import { AdminProductUpdatesService } from "./admin-product-updates.service";
// Imports de VALOR (não `import type`) de propósito — mesmo motivo
// documentado em admin-monitor.controller.ts: DTOs de @Query/@Body
// precisam disso pro Nest reflectir o metatype real (ValidationPipe
// global via main.ts), senão todo campo vira "should not exist".
// biome-ignore-start lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { CreateProductUpdateDto } from "./dto/create-product-update.dto";
import { EligibleCountQueryDto } from "./dto/eligible-count-query.dto";
import { PageQueryDto } from "./dto/page-query.dto";
import { PreviewProductUpdateDto } from "./dto/preview-product-update.dto";
import { SendTestProductUpdateDto } from "./dto/send-test-product-update.dto";
import { StartProductUpdateDto } from "./dto/start-product-update.dto";
import { UpdateProductUpdateDto } from "./dto/update-product-update.dto";
// biome-ignore-end lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype

// Toda escrita delega pra AdminProductUpdatesService -> ProductUpdatesService
// (nunca reimplementa regra de negócio aqui, mesmo padrão de
// admin-monitor.controller.ts). PRODUCT_UPDATES_ENABLED é checado dentro de
// ProductUpdatesService (sendTest/start), não aqui — o admin sempre pode
// criar/editar rascunhos mesmo com a flag desligada, só não pode disparar
// nada de verdade.
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/product-updates")
export class AdminProductUpdatesController {
  constructor(
    @Inject(AdminProductUpdatesService)
    private readonly service: AdminProductUpdatesService,
  ) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.service.list(query);
  }

  @Get(":id")
  getDetail(@Param("id") id: string) {
    return this.service.getDetail(id);
  }

  @Post()
  create(
    @Body() body: CreateProductUpdateDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.create({ ...body, createdBy: admin.id });
  }

  @Post(":id")
  update(@Param("id") id: string, @Body() body: UpdateProductUpdateDto) {
    return this.service.update(id, body);
  }

  @Post(":id/preview")
  preview(@Param("id") id: string, @Body() body: PreviewProductUpdateDto) {
    return this.service.preview(id, { withName: body.withName });
  }

  @Post(":id/send-test")
  sendTest(
    @Param("id") id: string,
    @Body() body: SendTestProductUpdateDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.sendTest(id, body.recipientEmail, admin.id);
  }

  @Post(":id/ready")
  markReady(@Param("id") id: string) {
    return this.service.markReady(id);
  }

  @Get(":id/eligible-count")
  eligibleCount(
    @Param("id") _id: string,
    @Query() query: EligibleCountQueryDto,
  ) {
    return this.service
      .eligibleCount(query.audience)
      .then((count) => ({ count }));
  }

  @Post(":id/start")
  start(
    @Param("id") id: string,
    @Body() body: StartProductUpdateDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.start(id, {
      audience: body.audience,
      confirmedRecipientCount: body.confirmedRecipientCount,
      startedBy: admin.id,
    });
  }

  @Post(":id/cancel")
  cancel(
    @Param("id") id: string,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.service.cancel(id, admin.id);
  }

  @Get(":id/deliveries")
  listDeliveries(@Param("id") id: string, @Query() query: PageQueryDto) {
    return this.service.listDeliveries(id, query);
  }

  @Get(":id/deliveries/:deliveryId/timeline")
  deliveryTimeline(
    @Param("id") id: string,
    @Param("deliveryId") deliveryId: string,
  ) {
    return this.service.deliveryTimeline(id, deliveryId);
  }

  @Get(":id/stats")
  stats(@Param("id") id: string) {
    return this.service.stats(id);
  }
}
