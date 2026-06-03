"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";

import {
  getProfileFieldDefaultValue,
  type ProfileBlockDefinition,
  type UserProfileRecord,
} from "./profile-blocks";

type ProfileBlockAction = (formData: FormData) => void | Promise<void>;

type CvMasterBlockProps = {
  action: ProfileBlockAction;
  block: ProfileBlockDefinition;
  defaultOpen?: boolean;
  gapHint: string;
  hasGap: boolean;
  hasSugestao?: boolean;
  index: number;
  profile: UserProfileRecord;
};

type BlockState = "completo" | "lacuna" | "sugestao";

const STATE_META: Record<
  BlockState,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  completo: {
    label: "Completo",
    dot: "#2a6a10",
    text: "#2a6a10",
    bg: "transparent",
    border: "rgba(10,10,10,0.12)",
  },
  lacuna: {
    label: "Lacuna",
    dot: "#e0a90c",
    text: "#a07a0a",
    bg: "rgba(245,197,24,0.13)",
    border: "rgba(220,170,20,0.30)",
  },
  sugestao: {
    label: "Sugestão da IA",
    dot: "#7aa01a",
    text: "#3a5008",
    bg: "rgba(198,255,58,0.18)",
    border: "rgba(110,150,20,0.22)",
  },
};

function StateChip({ state }: { state: BlockState }) {
  const m = STATE_META[state];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-[9px] py-[3px] font-mono text-[10px] font-medium tracking-[0.03em]"
      style={{
        color: m.text,
        background: m.bg,
        border: `1px solid ${m.border}`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

function getFieldId(blockId: string, fieldName: string) {
  return `${blockId}-${fieldName}`;
}

export function CvMasterBlock({
  action,
  block,
  defaultOpen = false,
  hasGap,
  hasSugestao = false,
  index,
  profile,
}: CvMasterBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const state: BlockState = hasGap
    ? "lacuna"
    : hasSugestao
      ? "sugestao"
      : "completo";
  const idx = String(index).padStart(2, "0");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] border bg-[#fafaf6] transition-[border-color,box-shadow] duration-150",
        open
          ? "border-[rgba(10,10,10,0.16)] shadow-[0_10px_28px_-16px_rgba(10,10,10,0.18)]"
          : "border-[rgba(10,10,10,0.08)]",
      )}
      id={block.id}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${block.id}-panel`}
        onClick={() => setOpen((cur) => !cur)}
        className="flex w-full items-center gap-3.5 px-[18px] py-[15px] text-left"
      >
        <span className="w-[18px] shrink-0 font-mono text-[11px] font-medium text-[#8a8a85]">
          {idx}
        </span>
        <span className="flex-1 text-[15px] font-medium tracking-[-0.01em] text-[#0a0a0a]">
          {block.title}
        </span>
        <StateChip state={state} />
        <span
          className="text-[#8a8a85] transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden="true"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 4l5 5 5-5" />
          </svg>
        </span>
      </button>

      {open && (
        <form
          action={action}
          id={`${block.id}-panel`}
          className="border-t border-[rgba(10,10,10,0.06)]"
        >
          <input name="focus" type="hidden" value={block.id} />

          <div className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
            {block.fields.map((field) => {
              const id = getFieldId(block.id, field.name);

              if (field.type === "checkbox") {
                return (
                  <label
                    key={field.name}
                    htmlFor={id}
                    className="flex items-center gap-3 rounded-[10px] border border-[rgba(10,10,10,0.08)] bg-white p-4 text-sm text-[#0a0a0a]"
                  >
                    <input
                      defaultChecked={Boolean(
                        getProfileFieldDefaultValue(profile, field),
                      )}
                      id={id}
                      name={field.name}
                      type="checkbox"
                      className="size-4 rounded border-[#CFCFCF] text-[#111111] focus:ring-[#111111]"
                    />
                    <span>{field.label}</span>
                  </label>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.name} className="space-y-2 md:col-span-1">
                    <label
                      className="text-sm font-medium text-[#0a0a0a]"
                      htmlFor={id}
                    >
                      {field.label}
                    </label>
                    <select
                      defaultValue={String(
                        getProfileFieldDefaultValue(profile, field),
                      )}
                      id={id}
                      name={field.name}
                      className="h-12 w-full rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 text-sm text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
                    >
                      <option value="">Selecione</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (field.type === "json") {
                return (
                  <div key={field.name} className="space-y-2 md:col-span-2">
                    <label
                      className="text-sm font-medium text-[#0a0a0a]"
                      htmlFor={id}
                    >
                      {field.label}
                    </label>
                    <textarea
                      defaultValue={String(
                        getProfileFieldDefaultValue(profile, field),
                      )}
                      id={id}
                      name={field.name}
                      rows={field.rows ?? 8}
                      spellCheck={false}
                      className="w-full rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 py-3 font-mono text-[13px] leading-6 text-[#0a0a0a] outline-none transition-colors placeholder:text-[#8a8a85] focus:border-[#0a0a0a]"
                    />
                    {field.helpText ? (
                      <p className="text-xs text-[#8a8a85]">{field.helpText}</p>
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  key={field.name}
                  className={cn(
                    "space-y-2",
                    field.type === "textarea" ? "md:col-span-2" : undefined,
                  )}
                >
                  <label
                    className="text-sm font-medium text-[#0a0a0a]"
                    htmlFor={id}
                  >
                    {field.label}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      defaultValue={String(
                        getProfileFieldDefaultValue(profile, field),
                      )}
                      id={id}
                      name={field.name}
                      rows={field.rows ?? 4}
                      className="w-full rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 py-3 text-sm text-[#0a0a0a] outline-none transition-colors placeholder:text-[#8a8a85] focus:border-[#0a0a0a]"
                    />
                  ) : (
                    <input
                      defaultValue={String(
                        getProfileFieldDefaultValue(profile, field),
                      )}
                      id={id}
                      name={field.name}
                      type={field.type === "number" ? "number" : "text"}
                      className="h-12 w-full rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 text-sm text-[#0a0a0a] outline-none transition-colors placeholder:text-[#8a8a85] focus:border-[#0a0a0a]"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(10,10,10,0.06)] px-5 py-4 md:px-6">
            <p className="text-[13px] text-[#5a5a55]">
              {hasGap
                ? "Salve este bloco para atualizar o perfil."
                : "Edite apenas o bloco que deseja revisar."}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-10 items-center rounded-full border border-[rgba(10,10,10,0.12)] bg-white px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#0a0a0a] transition-colors hover:bg-[rgba(10,10,10,0.04)]"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="inline-flex h-10 items-center rounded-full bg-[#0a0a0a] px-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#fafaf6] transition-colors hover:bg-[#1a1a1a]"
                type="submit"
              >
                Salvar bloco
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
