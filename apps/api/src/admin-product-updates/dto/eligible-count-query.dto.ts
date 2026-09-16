import { IsIn } from "class-validator";

export class EligibleCountQueryDto {
  @IsIn(["INTERNAL_TEST", "ALL_ELIGIBLE_USERS"])
  audience!: "INTERNAL_TEST" | "ALL_ELIGIBLE_USERS";
}
