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

    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[fake-email] to=${message.to} subject=${message.subject} text=${message.text}`,
      );
    }
  }

  listSentMessages() {
    return this.sentMessages.map((message) => ({ ...message }));
  }

  clear() {
    this.sentMessages.length = 0;
  }
}
