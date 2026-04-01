import { SetMetadata } from "@nestjs/common";

export const INTERNAL_ROLES_KEY = "internal_roles";

export type InternalRole = "admin" | "superadmin";

export const InternalRoles = (...roles: InternalRole[]) =>
  SetMetadata(INTERNAL_ROLES_KEY, roles);
