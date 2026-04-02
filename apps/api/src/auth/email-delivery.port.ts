export type EmailDeliveryMessage = {
  html?: string;
  subject: string;
  text: string;
  to: string;
};

export interface EmailDeliveryPort {
  send(message: EmailDeliveryMessage): Promise<void>;
}

export const EMAIL_DELIVERY_PORT = Symbol("EMAIL_DELIVERY_PORT");
