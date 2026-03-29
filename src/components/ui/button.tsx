import { type ButtonHTMLAttributes, forwardRef } from "react";
import { twMerge } from "tailwind-merge";
import { tv, type VariantProps } from "tailwind-variants";

export const buttonVariants = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-lg border border-white/15",
    "font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-white",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:translate-y-px",
  ],
  variants: {
    variant: {
      primary: [
        "rounded-full bg-linear-to-br from-orange-500 via-orange-600 to-amber-600 !text-white hover:!text-white",
        "shadow-[0_12px_30px_-12px_rgba(194,65,12,0.85),inset_0_1px_0_rgba(255,255,255,0.22)]",
        "hover:-translate-y-0.5 hover:from-orange-400 hover:via-orange-500 hover:to-amber-500",
      ],
      secondary: [
        "bg-orange-50 text-orange-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]",
        "hover:bg-orange-100",
      ],
      outline: [
        "border-orange-300/80 bg-white text-orange-900",
        "shadow-[0_10px_25px_-20px_rgba(154,52,18,0.55)] hover:border-orange-400 hover:bg-orange-50",
      ],
      ghost: [
        "border-transparent bg-transparent text-orange-950",
        "hover:bg-orange-100/70",
      ],
      dark: [
        "border-orange-200/10 bg-stone-950 text-orange-50",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_30px_-18px_rgba(0,0,0,0.8)]",
        "hover:bg-stone-900",
      ],
    },
    size: {
      sm: "h-9 px-3.5 text-[10px]",
      md: "h-11 px-5",
      lg: "h-12 px-6 text-xs",
      icon: "size-11 shrink-0 px-0",
    },
    block: {
      true: "w-full",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ block, className, size, type = "button", variant, ...props }, ref) => {
    return (
      <button
        className={twMerge(buttonVariants({ block, size, variant }), className)}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
