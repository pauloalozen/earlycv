import { IsIn } from "class-validator";

export class EligibleCountQueryDto {
  @IsIn(["INTERNAL_TEST", "PAID", "ALL_ELIGIBLE_USERS"])
  audience!: "INTERNAL_TEST" | "PAID" | "ALL_ELIGIBLE_USERS";
}
