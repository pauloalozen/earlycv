import type { HTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";

import { cn } from "@/lib/cn";

const brandMarkVariants = tv({
  base: "relative inline-flex shrink-0 overflow-hidden bg-orange-600",
  variants: {
    size: {
      sm: "size-7 rounded-[9px]",
      md: "size-9 rounded-xl",
      lg: "size-11 rounded-2xl",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const notchVariants = tv({
  base: "absolute left-[58%] top-0 bg-stone-50",
  variants: {
    size: {
      sm: "h-[42%] w-[42%] rounded-tr-[9px] rounded-bl-[9px]",
      md: "h-[43%] w-[43%] rounded-tr-[11px] rounded-bl-[11px]",
      lg: "h-[43%] w-[43%] rounded-tr-[13px] rounded-bl-[13px]",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const stemVariants = tv({
  base: "absolute left-[26%] top-[22%] rounded-full bg-white",
  variants: {
    size: {
      sm: "h-[57%] w-[14%]",
      md: "h-[58%] w-[14%]",
      lg: "h-[58%] w-[14%]",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const armVariants = tv({
  base: "absolute left-[39%] top-[42%] origin-left rounded-full bg-white -rotate-[32deg]",
  variants: {
    size: {
      sm: "h-[14%] w-[36%]",
      md: "h-[14%] w-[36%]",
      lg: "h-[14%] w-[36%]",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export type BrandMarkProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof brandMarkVariants>;

export function BrandMark({ className, size, ...props }: BrandMarkProps) {
  return (
    <div className={cn(brandMarkVariants({ size }), className)} {...props}>
      <span className={notchVariants({ size })} />
      <span className={stemVariants({ size })} />
      <span className={armVariants({ size })} />
    </div>
  );
}
