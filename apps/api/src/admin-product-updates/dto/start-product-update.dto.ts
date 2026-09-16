import { Type } from "class-transformer";
import { IsIn, IsInt, Min } from "class-validator";

export class StartProductUpdateDto {
  @IsIn(["INTERNAL_TEST", "ALL_ELIGIBLE_USERS"])
  audience!: "INTERNAL_TEST" | "ALL_ELIGIBLE_USERS";

  // Precisa bater com o recálculo feito no servidor no momento do start —
  // protege contra confirmar às cegas um número que já ficou desatualizado
  // (ver ProductUpdatesService.start).
  @Type(() => Number)
  @IsInt()
  @Min(0)
  confirmedRecipientCount!: number;
}
