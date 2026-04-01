import { IsIn } from "class-validator";

export class UpdateSuperadminStaffRoleDto {
  @IsIn(["admin", "superadmin"] as const)
  internalRole!: "admin" | "superadmin";
}
