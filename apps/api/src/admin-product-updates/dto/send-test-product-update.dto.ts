import { IsEmail } from "class-validator";

// Um único destinatário por requisição, de propósito (ver §5 do plano) —
// nunca uma lista.
export class SendTestProductUpdateDto {
  @IsEmail()
  recipientEmail!: string;
}
