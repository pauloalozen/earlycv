import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { Input } from "./input";

export type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  hint?: string;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, hint = "buscar", ...props }, ref) => {
    return (
      <div className="relative w-full">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
          {hint}
        </span>
        <Input
          className={cn("pl-16", className)}
          inputSize="sm"
          placeholder="Buscar vaga, empresa ou skill"
          ref={ref}
          {...props}
        />
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";
