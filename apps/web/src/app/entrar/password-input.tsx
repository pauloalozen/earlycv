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
    <div className="relative">
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
        className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 pr-11 text-sm text-[#111111] placeholder-[#BBBBBB] outline-none transition-colors focus:bg-[#EFEFEF]"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-3 flex cursor-pointer items-center text-[#AAAAAA] transition-colors hover:text-[#555555]"
        tabIndex={-1}
        aria-label={visible ? "Ocultar senha" : "Ver senha"}
      >
        {visible ? (
          <svg
            aria-hidden="true"
            width="18"
            height="18"
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
            width="18"
            height="18"
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
    </div>
  );
}
