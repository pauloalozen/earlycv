"use client";

import Link from "next/link";
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
  profile: UserProfileRecord;
};

function getFieldId(blockId: string, fieldName: string) {
  return `${blockId}-${fieldName}`;
}

export function CvMasterBlock({
  action,
  block,
  defaultOpen = false,
  gapHint,
  hasGap,
  profile,
}: CvMasterBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      aria-labelledby={`${block.id}-title`}
      className={cn(
        "rounded-[20px] border border-[#E5E5E5] bg-white shadow-[0_18px_50px_-30px_rgba(28,25,23,0.18)]",
        hasGap ? "ring-1 ring-[#DADADA]" : undefined,
      )}
      id={block.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F0F0F0] p-5 md:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
              {block.id}
            </p>
            <span className="rounded-full border border-[#E7E7E7] bg-[#FAFAFA] px-2.5 py-1 text-[11px] font-semibold text-[#111111]">
              {gapHint}
            </span>
          </div>
          <h2
            id={`${block.id}-title`}
            className="text-lg font-semibold tracking-tight text-[#111111]"
          >
            {block.title}
          </h2>
          <p className="max-w-2xl text-sm text-[#666666]">
            {block.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!open ? (
            <Link
              href={`/meu-cv-master?focus=${block.id}`}
              className="inline-flex h-10 items-center rounded-full border border-[#E5E5E5] bg-white px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#111111] transition-colors hover:bg-[#F5F5F5]"
            >
              Focar lacuna
            </Link>
          ) : null}
          <button
            aria-expanded={open}
            aria-controls={`${block.id}-panel`}
            className="inline-flex h-10 items-center rounded-full border border-[#111111] bg-[#111111] px-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#1A1A1A]"
            type="button"
            onClick={() => setOpen((current) => !current)}
          >
            <span>{block.title}</span>
            <span className="ml-2 text-[10px] tracking-[0.24em]">
              {open ? "Fechar" : "Abrir"}
            </span>
          </button>
        </div>
      </div>

      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 md:p-6">
          <p className="text-sm text-[#666666]">
            {hasGap ? "Revisar agora." : "Bloco conferido."}
          </p>
          <span className="text-sm font-medium text-[#111111] underline underline-offset-4">
            {hasGap ? "Editar inline" : "Ver detalhes"}
          </span>
        </div>
      ) : (
        <form
          action={action}
          id={`${block.id}-panel`}
          className="space-y-5 p-5 md:p-6"
        >
          <input name="focus" type="hidden" value={block.id} />

          <div className="grid gap-4 md:grid-cols-2">
            {block.fields.map((field) => {
              const id = getFieldId(block.id, field.name);

              if (field.type === "checkbox") {
                return (
                  <label
                    key={field.name}
                    htmlFor={id}
                    className="flex items-center gap-3 rounded-2xl border border-[#EAEAEA] bg-[#FAFAFA] p-4 text-sm text-[#111111]"
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
                      className="text-sm font-medium text-[#111111]"
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
                      className="h-12 w-full rounded-xl border border-[#E5E5E5] bg-white px-4 text-sm text-[#111111] outline-none transition-colors focus:border-[#111111]"
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
                      className="text-sm font-medium text-[#111111]"
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
                      className="w-full rounded-2xl border border-[#E5E5E5] bg-white px-4 py-3 font-mono text-[13px] leading-6 text-[#111111] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#111111]"
                    />
                    {field.helpText ? (
                      <p className="text-xs text-[#888888]">{field.helpText}</p>
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
                    className="text-sm font-medium text-[#111111]"
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
                      className="w-full rounded-2xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#111111]"
                    />
                  ) : (
                    <input
                      defaultValue={String(
                        getProfileFieldDefaultValue(profile, field),
                      )}
                      id={id}
                      name={field.name}
                      type={field.type === "number" ? "number" : "text"}
                      className="h-12 w-full rounded-xl border border-[#E5E5E5] bg-white px-4 text-sm text-[#111111] outline-none transition-colors placeholder:text-[#AAAAAA] focus:border-[#111111]"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F0F0F0] pt-4">
            <p className="text-sm text-[#666666]">
              {hasGap
                ? "Salve este bloco para atualizar o perfil."
                : "Edite apenas o bloco que deseja revisar."}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex h-11 items-center rounded-full border border-[#E5E5E5] bg-white px-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#111111] transition-colors hover:bg-[#F5F5F5]"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="inline-flex h-11 items-center rounded-full bg-[#111111] px-5 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#1A1A1A]"
                type="submit"
              >
                Salvar bloco
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
