import { forwardRef, type InputHTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";

import { cn } from "@/lib/cn";

const inputVariants = tv({
  base: [
    "w-full rounded-lg border bg-white px-4 py-3 text-sm font-medium text-stone-950",
    "placeholder:text-stone-400",
    "transition-colors duration-200",
    "focus-visible:border-orange-500 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ],
  variants: {
    variant: {
      default: "border-stone-200",
      muted: "border-transparent bg-stone-100",
      ghost: "border-stone-200 bg-white/80",
    },
    inputSize: {
      sm: "h-10 px-3.5 text-[13px]",
      md: "h-12",
      lg: "h-14 px-5 text-[15px]",
    },
  },
  defaultVariants: {
    variant: "default",
    inputSize: "md",
  },
});

export type InputProps = InputHTMLAttributes<HTMLInputElement> &
  VariantProps<typeof inputVariants>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize, variant, ...props }, ref) => {
    return (
      <input
        className={cn(inputVariants({ inputSize, variant }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
