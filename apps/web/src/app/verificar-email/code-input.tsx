"use client";

import { useRef, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

const CODE_SLOT_KEYS = [
  "slot-0",
  "slot-1",
  "slot-2",
  "slot-3",
  "slot-4",
  "slot-5",
];

export function CodeInput({ name }: { name: string }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    const next = ["", "", "", "", "", ""];
    pasted.split("").forEach((d, i) => {
      next[i] = d;
    });
    setDigits(next);
    const lastFilled = Math.min(pasted.length, 5);
    refs.current[lastFilled]?.focus();
  };

  return (
    <>
      <input type="hidden" name={name} value={digits.join("")} />
      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        {digits.map((digit, i) => (
          <input
            key={CODE_SLOT_KEYS[i]}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            style={{
              width: 48,
              height: 58,
              borderRadius: 12,
              border: digit
                ? "1.5px solid rgba(10,10,10,0.25)"
                : "1.5px solid rgba(10,10,10,0.1)",
              background: digit ? "#fff" : "rgba(10,10,10,0.03)",
              fontFamily: MONO,
              fontSize: 22,
              fontWeight: 600,
              textAlign: "center",
              color: "#0a0a0a",
              outline: "none",
              transition: "border-color 150ms, background 150ms, box-shadow 150ms",
              boxShadow: digit ? "0 2px 8px rgba(10,10,10,0.06)" : "none",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#0a0a0a";
              e.target.style.boxShadow = "0 0 0 3px rgba(10,10,10,0.08)";
              e.target.style.background = "#fff";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = digits[i]
                ? "rgba(10,10,10,0.25)"
                : "rgba(10,10,10,0.1)";
              e.target.style.boxShadow = digits[i]
                ? "0 2px 8px rgba(10,10,10,0.06)"
                : "none";
              e.target.style.background = digits[i]
                ? "#fff"
                : "rgba(10,10,10,0.03)";
            }}
          />
        ))}
      </div>
    </>
  );
}
