import { IsEmail } from "class-validator";

// Um único destinatário por requisição, de propósito — nunca uma lista.
export class SendTestEmailTemplateDto {
  @IsEmail()
  recipientEmail!: string;
}
