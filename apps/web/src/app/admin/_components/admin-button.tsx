import { twMerge } from "tailwind-merge";

type AdminButtonVariantOptions = {
  size?: "sm" | "md";
  variant?: "default" | "outline";
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2";

const VARIANTS: Record<
  NonNullable<AdminButtonVariantOptions["variant"]>,
  string
> = {
  default: "bg-stone-950 !text-white hover:bg-stone-800 active:bg-stone-900",
  outline:
    "border border-stone-200 bg-white text-stone-900 hover:bg-stone-50 active:bg-stone-100",
};

const SIZES: Record<NonNullable<AdminButtonVariantOptions["size"]>, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-[13px]",
};

export function buttonVariants(
  opts?: AdminButtonVariantOptions,
  className?: string,
) {
  const variant = opts?.variant ?? "default";
  const size = opts?.size ?? "md";
  return twMerge(BASE, VARIANTS[variant], SIZES[size], className);
}
