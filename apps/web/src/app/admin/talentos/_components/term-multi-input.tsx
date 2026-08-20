"use client";

import { useMemo, useRef, useState } from "react";

const inputStyle = {
  borderColor: "rgba(10,10,10,0.08)",
  background: "#fafaf6",
  color: "#2a2620",
} as const;

type TermMultiInputProps = {
  name: string;
  defaultValue?: string;
  placeholder: string;
  suggestions: string[];
  minWidth?: number;
};

// Input de múltiplos termos separados por vírgula (ex: "javascript, react,
// ia") com sugestão dos rótulos que já existem no banco pro último termo
// sendo digitado — puro HTML/form GET continua funcionando (o valor final
// vai no mesmo `name`), o JS só melhora a digitação.
export function TermMultiInput({
  name,
  defaultValue,
  placeholder,
  suggestions,
  minWidth = 180,
}: TermMultiInputProps) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentTerm = useMemo(() => {
    const lastSegment = value.split(",").pop() ?? "";
    return lastSegment.trim().toLowerCase();
  }, [value]);

  const matches = useMemo(() => {
    if (!currentTerm) return [];
    const alreadyPicked = new Set(
      value
        .split(",")
        .slice(0, -1)
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean),
    );
    return suggestions
      .filter(
        (option) =>
          option.toLowerCase().includes(currentTerm) &&
          !alreadyPicked.has(option.toLowerCase()),
      )
      .slice(0, 8);
  }, [currentTerm, suggestions, value]);

  function pickSuggestion(option: string) {
    const segments = value.split(",");
    segments[segments.length - 1] = ` ${option}`;
    const next = `${segments
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join(", ")}, `;
    setValue(next);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        autoComplete="off"
        className="h-9 rounded-md border px-3 text-[12.5px]"
        name={name}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{ ...inputStyle, minWidth }}
        value={value}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            minWidth: minWidth,
            overflow: "hidden",
          }}
        >
          {matches.map((option) => (
            <button
              key={option}
              className="term-suggestion"
              onMouseDown={(event) => {
                event.preventDefault();
                pickSuggestion(option);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 10px",
                fontSize: 12.5,
                color: "#2a2620",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
