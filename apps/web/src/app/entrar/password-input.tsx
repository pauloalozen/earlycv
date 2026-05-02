"use client";

import { useState } from "react";

type Props = {
  id?: string;
  name: string;
  placeholder: string;
  autoComplete: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
};

export function PasswordInput({
  id,
  name,
  placeholder,
  autoComplete,
  value,
  onChange,
  onBlur,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        onBlur={onBlur}
        style={{
          width: "100%",
          background: "#fff",
          border: "1px solid #d8d6ce",
          borderRadius: 8,
          padding: "11px 42px 11px 13px",
          fontSize: 13.5,
          color: "#0a0a0a",
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 150ms",
        }}
        className="entrar-input"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "absolute",
          inset: "0 0 0 auto",
          width: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#aaa8a2",
        }}
        tabIndex={-1}
        aria-label={visible ? "Ocultar senha" : "Ver senha"}
        className="entrar-pw-toggle"
      >
        {visible ? (
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
      <style>{`
        .entrar-input:focus { border-color: #0a0a0a !important; }
        .entrar-pw-toggle:hover { color: #3a3a38 !important; }
      `}</style>
    </div>
  );
}
