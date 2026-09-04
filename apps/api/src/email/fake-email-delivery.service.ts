import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";

import type {
  EmailDeliveryMessage,
  EmailDeliveryPort,
  EmailDeliveryResult,
} from "./email-delivery.port";

@Injectable()
export class FakeEmailDeliveryService implements EmailDeliveryPort {
  private readonly sentMessages: EmailDeliveryMessage[] = [];

  async send(message: EmailDeliveryMessage): Promise<EmailDeliveryResult> {
    this.sentMessages.push({ ...message });

    const codeMatch = message.text.match(/\b(\d{6})\b/);
    const highlight = codeMatch ? `\n\n  🔑  CÓDIGO: ${codeMatch[1]}\n` : "";
    console.info(
      `\n📧 [fake-email] para=${message.to} assunto="${message.subject}"${highlight}  texto: ${message.text}\n`,
    );

    return { providerMessageId: `fake-${randomUUID()}` };
  }

  listSentMessages() {
    return this.sentMessages.map((message) => ({ ...message }));
  }

  clear() {
    this.sentMessages.length = 0;
  }
}
