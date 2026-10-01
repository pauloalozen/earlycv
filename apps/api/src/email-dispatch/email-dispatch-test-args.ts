import { parseArgs } from "node:util";

import type { FeedbackVariant } from "./email-dispatch-templates";

// Argumentos do script de teste EXPLÍCITO (send-relationship-test.ts), em
// função pura para ser testada. Princípios: um único destinatário informado,
// nunca a base; transporte real só com --real-send; combinações ambíguas ou
// perigosas são recusadas, nunca "adivinhadas".
export type TestTransport = "dry-run" | "fake" | "real";

export type ParsedTestArgs = {
  kind: "WELCOME" | "FEEDBACK_FIRST_USE" | "PURCHASE_CONFIRMATION";
  to: string;
  name: string | null;
  variant: FeedbackVariant;
  transport: TestTransport;
  // Só com --real-send: envia sem abrir o banco nem gravar EmailDispatch.
  noDb: boolean;
  payload?: {
    planType: string;
    amountInCents: number;
    currency: string;
    credits: number;
    analysisCredits: number;
    isUnlimited: boolean;
    isCouponRedemption: boolean;
  };
};

export class TestArgsError extends Error {}

const SINGLE_ADDRESS = /^[^\s,;<>()"@]+@[^\s,;<>()"@]+\.[^\s,;<>()"@]+$/;

function nonNegativeInt(
  value: string | undefined,
  fallback: number,
  flag: string,
) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TestArgsError(`${flag} precisa ser um inteiro >= 0`);
  }
  return parsed;
}

export function parseTestArgs(argv: string[]): ParsedTestArgs {
  let values: ReturnType<typeof parseArgs>["values"];
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        kind: { type: "string" },
        to: { type: "string", multiple: true },
        name: { type: "string" },
        variant: { type: "string" },
        "fake-send": { type: "boolean", default: false },
        "real-send": { type: "boolean", default: false },
        "no-db": { type: "boolean", default: false },
        plan: { type: "string" },
        amount: { type: "string" },
        credits: { type: "string" },
        analysis: { type: "string" },
        coupon: { type: "boolean", default: false },
        unlimited: { type: "boolean", default: false },
      },
    }));
  } catch (error) {
    throw new TestArgsError(
      error instanceof Error ? error.message : "args inválidos",
    );
  }

  const kindArg = values.kind as string | undefined;
  const kind =
    kindArg === "welcome"
      ? "WELCOME"
      : kindArg === "feedback"
        ? "FEEDBACK_FIRST_USE"
        : kindArg === "purchase"
          ? "PURCHASE_CONFIRMATION"
          : null;
  if (!kind)
    throw new TestArgsError("--kind precisa ser welcome, feedback ou purchase");

  const tos = (values.to as string[] | undefined) ?? [];
  if (tos.length !== 1) {
    throw new TestArgsError("informe exatamente UM destinatário em --to");
  }
  const to = tos[0].trim().toLowerCase();
  if (!SINGLE_ADDRESS.test(to)) {
    throw new TestArgsError(
      "--to precisa ser um único endereço de e-mail (sem vírgula, espaço ou lista)",
    );
  }

  const fake = values["fake-send"] === true;
  const real = values["real-send"] === true;
  if (fake && real)
    throw new TestArgsError("use --fake-send OU --real-send, nunca os dois");

  const noDb = values["no-db"] === true;
  if (noDb && !real)
    throw new TestArgsError("--no-db só faz sentido com --real-send");
  if (noDb && kind === "PURCHASE_CONFIRMATION") {
    throw new TestArgsError("--no-db só existe para welcome/feedback");
  }

  const coupon = values.coupon === true;
  const payload =
    kind === "PURCHASE_CONFIRMATION"
      ? {
          planType: (values.plan as string | undefined) ?? "pro",
          amountInCents: coupon
            ? 0
            : nonNegativeInt(
                values.amount as string | undefined,
                4990,
                "--amount",
              ),
          currency: "BRL",
          credits: nonNegativeInt(
            values.credits as string | undefined,
            5,
            "--credits",
          ),
          analysisCredits: nonNegativeInt(
            values.analysis as string | undefined,
            5,
            "--analysis",
          ),
          isUnlimited: values.unlimited === true,
          isCouponRedemption: coupon,
        }
      : undefined;

  return {
    kind,
    to,
    name: (values.name as string | undefined) ?? null,
    variant:
      (values.variant as string | undefined)?.toLowerCase() === "viewed"
        ? "VIEWED"
        : "NEUTRAL",
    transport: real ? "real" : fake ? "fake" : "dry-run",
    noDb,
    payload,
  };
}
