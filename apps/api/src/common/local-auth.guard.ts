import {
  BadRequestException,
  type ExecutionContext,
  Injectable,
  ValidationPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import { LoginDto } from "../auth/dto/login.dto";

const loginValidationPipe = new ValidationPipe({
  expectedType: LoginDto,
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});

@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ body: LoginDto }>();

    try {
      request.body = (await loginValidationPipe.transform(request.body, {
        metatype: LoginDto,
        type: "body",
      })) as LoginDto;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "invalid login payload",
      );
    }

    return (await Promise.resolve(
      super.canActivate(context) as boolean | Promise<boolean>,
    )) as boolean;
  }
}
