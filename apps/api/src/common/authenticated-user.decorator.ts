import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export type AuthenticatedRequestUser = {
  id: string;
  email: string;
  name: string;
  planType: string;
  status: string;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const AuthenticatedUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedRequestUser;
    }>();

    return request.user;
  },
);
