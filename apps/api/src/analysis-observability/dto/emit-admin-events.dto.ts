import { Transform } from "class-transformer";
import {
  IsIn,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from "class-validator";

const EMIT_MODES = ["single", "group", "all"] as const;
const EMIT_GROUPS = ["protection", "business"] as const;

@ValidatorConstraint({ name: "emitAdminEventsModeRule", async: false })
class EmitAdminEventsModeRule implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as EmitAdminEventsDto;

    if (dto.mode === "single") {
      return (
        typeof dto.eventName === "string" &&
        dto.eventName.trim().length > 0 &&
        dto.group === undefined
      );
    }

    if (dto.mode === "group") {
      return (
        typeof dto.group === "string" &&
        dto.group.trim().length > 0 &&
        dto.eventName === undefined
      );
    }

    return dto.eventName === undefined && dto.group === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as EmitAdminEventsDto;

    if (dto.mode === "single") {
      return "single mode requires eventName and forbids group";
    }

    if (dto.mode === "group") {
      return "group mode requires group and forbids eventName";
    }

    return "all mode forbids eventName and group";
  }
}

export class EmitAdminEventsDto {
  @IsIn(EMIT_MODES)
  @Validate(EmitAdminEventsModeRule)
  mode!: (typeof EMIT_MODES)[number];

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  eventName?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(EMIT_GROUPS)
  group?: (typeof EMIT_GROUPS)[number];
}
