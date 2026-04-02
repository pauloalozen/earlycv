import { Injectable } from "@nestjs/common";

import type {
  EmailDeliveryMessage,
  EmailDeliveryPort,
} from "./email-delivery.port";

@Injectable()
export class FakeEmailDeliveryService implements EmailDeliveryPort {
  private readonly sentMessages: EmailDeliveryMessage[] = [];

  async send(message: EmailDeliveryMessage) {
    this.sentMessages.push({ ...message });
  }

  listSentMessages() {
    return this.sentMessages.map((message) => ({ ...message }));
  }

  clear() {
    this.sentMessages.length = 0;
  }
}
