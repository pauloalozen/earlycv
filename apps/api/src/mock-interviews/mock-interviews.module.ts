import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { EmailModule } from "../email/email.module";
import { AdminMockInterviewsController } from "./admin-mock-interviews.controller";
import { AdminMockInterviewsService } from "./admin-mock-interviews.service";
import { MockInterviewMercadoPagoGateway } from "./mock-interview-mercadopago";
import { MockInterviewNotificationsService } from "./mock-interview-notifications.service";
import { MockInterviewsController } from "./mock-interviews.controller";
import { MockInterviewsService } from "./mock-interviews.service";

// Entrevista Simulada (venda avulsa). Independente de PlansModule/
// PaymentsModule: checkout, webhook e e-mails próprios.
@Module({
  imports: [DatabaseModule, EmailModule],
  controllers: [MockInterviewsController, AdminMockInterviewsController],
  providers: [
    MockInterviewMercadoPagoGateway,
    MockInterviewNotificationsService,
    MockInterviewsService,
    AdminMockInterviewsService,
  ],
})
export class MockInterviewsModule {}
