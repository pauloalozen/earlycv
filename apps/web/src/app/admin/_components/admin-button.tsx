import { twMerge } from "tailwind-merge";

type AdminButtonVariantOptions = {
  size?: "sm" | "md";
  variant?: "default" | "outline";
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none";

const VARIANTS: Record<
  NonNullable<AdminButtonVariantOptions["variant"]>,
  string
> = {
  default:
    "bg-[#0a0a0a] !text-[#fafaf6] hover:bg-[#2a2620] active:bg-[#2a2620]",
  outline:
    "border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] text-[#2a2620] hover:bg-[#ebe9e3]",
};

const SIZES: Record<NonNullable<AdminButtonVariantOptions["size"]>, string> = {
  sm: "h-7 px-3 text-[11.5px]",
  md: "h-9 px-4 text-[12.5px]",
};

export function buttonVariants(
  opts?: AdminButtonVariantOptions,
  className?: string,
) {
  const variant = opts?.variant ?? "default";
  const size = opts?.size ?? "md";
  return twMerge(BASE, VARIANTS[variant], SIZES[size], className);
}
