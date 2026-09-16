import { registerDecorator, type ValidationOptions } from "class-validator";

import { isSafeProductUpdateButtonUrl } from "../../product-updates/product-update-button-url.util";

// Só a primeira barreira (feedback HTTP imediato, 400 em vez de deixar o
// service rejeitar depois) — ProductUpdatesService valida de novo antes
// de persistir, nunca confia só neste decorator (ver
// product-update-button-url.util.ts).
export function IsSafeButtonUrl(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "isSafeButtonUrl",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === "string" && isSafeProductUpdateButtonUrl(value)
          );
        },
        defaultMessage(): string {
          return "primaryButtonUrl precisa ser uma URL absoluta https, sem javascript:/data:/caracteres capazes de quebrar o atributo HTML";
        },
      },
    });
  };
}
