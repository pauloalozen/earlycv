"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

import { ConfirmDialog } from "./confirm-dialog";
import {
  getProfileFieldDefaultValue,
  type ProfileBlockDefinition,
  type UserProfileRecord,
} from "./profile-blocks";

type ProfileBlockAction = (formData: FormData) => void | Promise<void>;

type CvMasterBlockProps = {
  action: ProfileBlockAction;
  clearAction: ProfileBlockAction;
  block: ProfileBlockDefinition;
  defaultOpen?: boolean;
  gapHint: string;
  hasGap: boolean;
  index: number;
  isOptional?: boolean;
  profile: UserProfileRecord;
  userEmail?: string;
};

type BlockState = "completo" | "lacuna" | "opcional";

const STATE_META: Record<
  BlockState,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  completo: {
    label: "Completo",
    dot: "#7aa01a",
    text: "#3a5008",
    bg: "rgba(198,255,58,0.18)",
    border: "rgba(110,150,20,0.22)",
  },
  lacuna: {
    label: "Lacuna",
    dot: "#e0a90c",
    text: "#a07a0a",
    bg: "rgba(245,197,24,0.13)",
    border: "rgba(220,170,20,0.30)",
  },
  opcional: {
    label: "Opcional",
    dot: "#8a8a85",
    text: "#6a6a65",
    bg: "transparent",
    border: "rgba(10,10,10,0.10)",
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

// ─── Shared form field atoms ───────────────────────────────────────────────

const inputCls =
  "h-11 w-full rounded-[8px] border border-[#e3e1d9] bg-white px-3 text-[13px] font-normal text-[#3a3a36] outline-none transition-[border-color] placeholder:text-[#b0aea8] focus:border-[#0a0a0a]";

const labelCls =
  "font-mono text-[9.5px] font-medium uppercase tracking-[0.06em] text-[#8a8a85]";

function Field({
  label,
  id,
  name,
  value,
  type = "text",
  placeholder,
}: {
  label: string;
  id: string;
  name: string;
  value: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <input
        className={inputCls}
        defaultValue={value}
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
      />
    </div>
  );
}

function TextareaField({
  label,
  id,
  name,
  value,
  rows = 4,
  placeholder,
}: {
  label: string;
  id: string;
  name: string;
  value: string;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5 md:col-span-2">
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <textarea
        className="w-full resize-none rounded-[8px] border border-[#e3e1d9] bg-white px-3 py-2.5 text-[13px] font-normal leading-relaxed text-[#3a3a36] outline-none transition-[border-color] placeholder:text-[#b0aea8] focus:border-[#0a0a0a]"
        defaultValue={value}
        id={id}
        name={name}
        rows={rows ?? 6}
        placeholder={placeholder}
      />
    </div>
  );
}

function ReadonlyField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className={labelCls}>{label}</span>
      <div className="flex h-11 items-center rounded-[8px] border border-[rgba(10,10,10,0.06)] bg-[#f5f4f0] px-3.5 text-[13.5px] text-[#8a8a85]">
        {value}
      </div>
    </div>
  );
}

function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 inline-flex items-center gap-1.5 rounded-[8px] border border-dashed border-[rgba(10,10,10,0.18)] px-4 py-2 text-[13px] font-medium text-[#8a8a85] transition-colors hover:border-[rgba(10,10,10,0.30)] hover:text-[#0a0a0a]"
    >
      + {label}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[#8a8a85] transition-colors hover:bg-[rgba(154,61,40,0.08)] hover:text-[#9a3d28]"
      aria-label="Remover"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      >
        <path d="M2 2l8 8M10 2l-8 8" />
      </svg>
    </button>
  );
}

function EntryCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-[#e3e1d9] bg-white p-4">
      {children}
    </div>
  );
}

// ─── JSON data helpers ─────────────────────────────────────────────────────

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asRecord(v: unknown): Record<string, unknown> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function uid() {
  return (
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );
}

// ─── Structured editors ───────────────────────────────────────────────────

type ExpEntry = {
  _id: string;
  role: string;
  company: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
};

function parseExps(raw: unknown): ExpEntry[] {
  return asArray(raw).map((item) => {
    const r = asRecord(item);
    return {
      _id: asStr(r.id) || uid(),
      role: asStr(r.role),
      company: asStr(r.company),
      startDate: asStr(r.startDate),
      endDate: asStr(r.endDate),
      isCurrent: Boolean(r.isCurrent),
      description: asStr(r.description),
    };
  });
}

function ExperienciasEditor({ raw }: { raw: unknown }) {
  const [entries, setEntries] = useState<ExpEntry[]>(() => parseExps(raw));

  const add = () =>
    setEntries((prev) => [
      ...prev,
      {
        _id: uid(),
        role: "",
        company: "",
        startDate: "",
        endDate: "",
        isCurrent: false,
        description: "",
      },
    ]);

  const remove = (id: string) =>
    setEntries((prev) => prev.filter((e) => e._id !== id));

  const update = (id: string, key: keyof ExpEntry, value: string | boolean) =>
    setEntries((prev) =>
      prev.map((e) => (e._id === id ? { ...e, [key]: value } : e)),
    );

  const serialized = JSON.stringify(
    entries.map(({ _id, ...rest }) => ({ id: _id, ...rest })),
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="experiencesJson" value={serialized} />
      {entries.length === 0 && (
        <p className="py-2 text-[13px] text-[#8a8a85]">
          Nenhuma experiência cadastrada.
        </p>
      )}
      {entries.map((e) => (
        <EntryCard key={e._id}>
          <div className="mb-3 flex items-center justify-between">
            <span className={labelCls}>Experiência</span>
            <RemoveButton onClick={() => remove(e._id)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`exp-role-${e._id}`}>
                Cargo
              </label>
              <input
                className={inputCls}
                id={`exp-role-${e._id}`}
                value={e.role}
                onChange={(ev) => update(e._id, "role", ev.target.value)}
                placeholder="Cargo ou título"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`exp-company-${e._id}`}>
                Empresa
              </label>
              <input
                className={inputCls}
                id={`exp-company-${e._id}`}
                value={e.company}
                onChange={(ev) => update(e._id, "company", ev.target.value)}
                placeholder="Nome da empresa"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`exp-start-${e._id}`}>
                Início
              </label>
              <input
                className={inputCls}
                id={`exp-start-${e._id}`}
                value={e.startDate}
                onChange={(ev) => update(e._id, "startDate", ev.target.value)}
                placeholder="Ex.: Jan 2020"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`exp-end-${e._id}`}>
                Fim
              </label>
              {e.isCurrent ? (
                <div className={cn(inputCls, "flex items-center text-[#8a8a85]")}>
                  Emprego atual
                </div>
              ) : (
                <input
                  className={inputCls}
                  id={`exp-end-${e._id}`}
                  value={e.endDate}
                  onChange={(ev) => update(e._id, "endDate", ev.target.value)}
                  placeholder="Ex.: Dez 2023"
                />
              )}
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[12px] text-[#5a5a55]">
                <input
                  type="checkbox"
                  checked={e.isCurrent}
                  onChange={(ev) =>
                    update(e._id, "isCurrent", ev.target.checked)
                  }
                  className="rounded border-[rgba(10,10,10,0.2)]"
                />
                Emprego atual
              </label>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className={labelCls} htmlFor={`exp-desc-${e._id}`}>
                Descrição
              </label>
              <textarea
                className="w-full resize-none rounded-[8px] border border-[#e3e1d9] bg-white px-3 py-2.5 text-[13px] font-normal leading-relaxed text-[#3a3a36] outline-none transition-[border-color] placeholder:text-[#b0aea8] focus:border-[#0a0a0a]"
                id={`exp-desc-${e._id}`}
                value={e.description}
                onChange={(ev) =>
                  update(e._id, "description", ev.target.value)
                }
                rows={5}
                placeholder="Responsabilidades e conquistas principais"
              />
            </div>
          </div>
        </EntryCard>
      ))}
      <AddButton label="Adicionar experiência" onClick={add} />
    </div>
  );
}

type EduEntry = {
  _id: string;
  degree: string;
  fieldOfStudy: string;
  institution: string;
  startDate: string;
  endDate: string;
};

function parseEdu(raw: unknown): EduEntry[] {
  return asArray(raw).map((item) => {
    const r = asRecord(item);
    return {
      _id: asStr(r.id) || uid(),
      degree: asStr(r.degree),
      fieldOfStudy: asStr(r.fieldOfStudy),
      institution: asStr(r.institution),
      startDate: asStr(r.startDate),
      endDate: asStr(r.endDate),
    };
  });
}

function FormacaoEditor({ raw }: { raw: unknown }) {
  const [entries, setEntries] = useState<EduEntry[]>(() => parseEdu(raw));

  const add = () =>
    setEntries((prev) => [
      ...prev,
      {
        _id: uid(),
        degree: "",
        fieldOfStudy: "",
        institution: "",
        startDate: "",
        endDate: "",
      },
    ]);

  const remove = (id: string) =>
    setEntries((prev) => prev.filter((e) => e._id !== id));

  const update = (id: string, key: keyof EduEntry, value: string) =>
    setEntries((prev) =>
      prev.map((e) => (e._id === id ? { ...e, [key]: value } : e)),
    );

  const serialized = JSON.stringify(
    entries.map(({ _id, ...rest }) => ({ id: _id, ...rest })),
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name="educationJson" value={serialized} />
      {entries.length === 0 && (
        <p className="py-2 text-[13px] text-[#8a8a85]">
          Nenhuma formação cadastrada.
        </p>
      )}
      {entries.map((e) => (
        <EntryCard key={e._id}>
          <div className="mb-3 flex items-center justify-between">
            <span className={labelCls}>Formação</span>
            <RemoveButton onClick={() => remove(e._id)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`edu-degree-${e._id}`}>
                Grau / Curso
              </label>
              <input
                className={inputCls}
                id={`edu-degree-${e._id}`}
                value={e.degree}
                onChange={(ev) => update(e._id, "degree", ev.target.value)}
                placeholder="Ex.: Bacharelado, MBA"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`edu-institution-${e._id}`}>
                Instituição
              </label>
              <input
                className={inputCls}
                id={`edu-institution-${e._id}`}
                value={e.institution}
                onChange={(ev) =>
                  update(e._id, "institution", ev.target.value)
                }
                placeholder="Nome da instituição"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label
                className={labelCls}
                htmlFor={`edu-field-${e._id}`}
              >
                Área de estudo
              </label>
              <input
                className={inputCls}
                id={`edu-field-${e._id}`}
                value={e.fieldOfStudy}
                onChange={(ev) =>
                  update(e._id, "fieldOfStudy", ev.target.value)
                }
                placeholder="Ex.: Ciência da Computação"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`edu-start-${e._id}`}>
                Início
              </label>
              <input
                className={inputCls}
                id={`edu-start-${e._id}`}
                value={e.startDate}
                onChange={(ev) => update(e._id, "startDate", ev.target.value)}
                placeholder="Ex.: 2014"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`edu-end-${e._id}`}>
                Fim
              </label>
              <input
                className={inputCls}
                id={`edu-end-${e._id}`}
                value={e.endDate}
                onChange={(ev) => update(e._id, "endDate", ev.target.value)}
                placeholder="Ex.: 2018"
              />
            </div>
          </div>
        </EntryCard>
      ))}
      <AddButton label="Adicionar formação" onClick={add} />
    </div>
  );
}

function parseSkillsFlat(raw: unknown): string[] {
  const r = asRecord(raw);
  const toStringArray = (v: unknown) =>
    asArray(v)
      .map((x) => asStr(x))
      .filter(Boolean);
  // Merge all buckets into a flat list for display
  return [
    ...toStringArray(r.technical),
    ...toStringArray(r.business),
    ...toStringArray(r.soft),
  ];
}

function HabilidadesEditor({ raw }: { raw: unknown }) {
  const [chips, setChips] = useState<string[]>(() => parseSkillsFlat(raw));
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim();
    if (!val || chips.includes(val)) return;
    setChips((prev) => [...prev, val]);
    setInput("");
  };

  const remove = (idx: number) =>
    setChips((prev) => prev.filter((_, i) => i !== idx));

  // Serialize as { technical: [...all], business: [], soft: [] }
  const serialized = JSON.stringify({
    technical: chips,
    business: [],
    soft: [],
  });

  return (
    <div className="space-y-3 md:col-span-2">
      <input type="hidden" name="skillsJson" value={serialized} />
      <div className="flex flex-wrap gap-2">
        {chips.map((chip, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#e3e1d9] bg-white px-2.5 py-1 font-mono text-[12px] text-[#0a0a0a]"
          >
            {chip}
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[#8a8a85] transition-colors hover:text-[#9a3d28]"
              aria-label={`Remover ${chip}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="h-10 flex-1 rounded-[8px] border border-dashed border-[#c8c6be] bg-transparent px-3 text-[13.5px] text-[#0a0a0a] outline-none placeholder:text-[#8a8a85] focus:border-[#0a0a0a]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Digitar competência e pressionar Enter"
        />
        <button
          type="button"
          onClick={add}
          className="h-10 rounded-[8px] border border-[#e3e1d9] bg-white px-4 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[rgba(10,10,10,0.04)]"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}

type LangEntry = { _id: string; language: string; level: string };

function parseLangs(raw: unknown): LangEntry[] {
  return asArray(raw).map((item) => {
    const r = asRecord(item);
    return {
      _id: uid(),
      language: asStr(r.language),
      level: asStr(r.level),
    };
  });
}

const LANG_LEVELS = [
  "Nativo",
  "Fluente",
  "Avançado",
  "Intermediário",
  "Básico",
];

function IdiomasEditor({ raw }: { raw: unknown }) {
  const [entries, setEntries] = useState<LangEntry[]>(() => parseLangs(raw));

  const add = () =>
    setEntries((prev) => [
      ...prev,
      { _id: uid(), language: "", level: "" },
    ]);

  const remove = (id: string) =>
    setEntries((prev) => prev.filter((e) => e._id !== id));

  const update = (id: string, key: keyof LangEntry, value: string) =>
    setEntries((prev) =>
      prev.map((e) => (e._id === id ? { ...e, [key]: value } : e)),
    );

  const serialized = JSON.stringify(
    entries.map(({ _id, ...rest }) => rest),
  );

  return (
    <div className="space-y-3 md:col-span-2">
      <input type="hidden" name="languagesJson" value={serialized} />
      {entries.length === 0 && (
        <p className="py-2 text-[13px] text-[#8a8a85]">
          Nenhum idioma cadastrado.
        </p>
      )}
      {entries.map((e) => (
        <div
          key={e._id}
          className="grid items-end gap-3 rounded-[10px] border border-[rgba(10,10,10,0.08)] bg-white p-4 md:grid-cols-[1fr_1fr_auto]"
        >
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor={`lang-name-${e._id}`}>
              Idioma
            </label>
            <input
              className={inputCls}
              id={`lang-name-${e._id}`}
              value={e.language}
              onChange={(ev) => update(e._id, "language", ev.target.value)}
              placeholder="Ex.: Inglês"
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor={`lang-level-${e._id}`}>
              Nível
            </label>
            <select
              className={cn(inputCls, "cursor-pointer text-[13px] text-[#3a3a36]")}
              id={`lang-level-${e._id}`}
              value={e.level}
              onChange={(ev) => update(e._id, "level", ev.target.value)}
            >
              <option value="">Selecionar nível</option>
              {LANG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <RemoveButton onClick={() => remove(e._id)} />
        </div>
      ))}
      <AddButton label="Adicionar idioma" onClick={add} />
    </div>
  );
}

type CertEntry = {
  _id: string;
  name: string;
  issuer: string;
  year: string;
};

function parseCerts(raw: unknown): CertEntry[] {
  return asArray(raw).map((item) => {
    const r = asRecord(item);
    return {
      _id: uid(),
      name: asStr(r.name),
      issuer: asStr(r.issuer),
      year: asStr(r.year),
    };
  });
}

function CertificacoesEditor({ raw }: { raw: unknown }) {
  const [entries, setEntries] = useState<CertEntry[]>(() => parseCerts(raw));

  const add = () =>
    setEntries((prev) => [
      ...prev,
      { _id: uid(), name: "", issuer: "", year: "" },
    ]);

  const remove = (id: string) =>
    setEntries((prev) => prev.filter((e) => e._id !== id));

  const update = (id: string, key: keyof CertEntry, value: string) =>
    setEntries((prev) =>
      prev.map((e) => (e._id === id ? { ...e, [key]: value } : e)),
    );

  const serialized = JSON.stringify(entries.map(({ _id, ...rest }) => rest));

  return (
    <div className="space-y-3">
      <input type="hidden" name="certificationsJson" value={serialized} />
      {entries.length === 0 && (
        <p className="py-2 text-[13px] text-[#8a8a85]">
          Nenhuma certificação cadastrada.
        </p>
      )}
      {entries.map((e) => (
        <EntryCard key={e._id}>
          <div className="mb-3 flex items-center justify-between">
            <span className={labelCls}>Certificação</span>
            <RemoveButton onClick={() => remove(e._id)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <label className={labelCls} htmlFor={`cert-name-${e._id}`}>
                Nome
              </label>
              <input
                className={inputCls}
                id={`cert-name-${e._id}`}
                value={e.name}
                onChange={(ev) => update(e._id, "name", ev.target.value)}
                placeholder="Ex.: AWS Solutions Architect"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`cert-issuer-${e._id}`}>
                Emissor / Instituição
              </label>
              <input
                className={inputCls}
                id={`cert-issuer-${e._id}`}
                value={e.issuer}
                onChange={(ev) => update(e._id, "issuer", ev.target.value)}
                placeholder="Ex.: Amazon, Coursera"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls} htmlFor={`cert-year-${e._id}`}>
                Ano
              </label>
              <input
                className={inputCls}
                id={`cert-year-${e._id}`}
                value={e.year}
                onChange={(ev) => update(e._id, "year", ev.target.value)}
                placeholder="Ex.: 2023"
              />
            </div>
          </div>
        </EntryCard>
      ))}
      <AddButton label="Adicionar certificação" onClick={add} />
    </div>
  );
}

type LinkEntry = { _id: string; label: string; url: string };

function parseLinks(raw: unknown): LinkEntry[] {
  return asArray(raw).map((item) => {
    const r = asRecord(item);
    return {
      _id: uid(),
      label: asStr(r.label),
      url: asStr(r.url),
    };
  });
}

function LinksEditor({ raw }: { raw: unknown }) {
  const [entries, setEntries] = useState<LinkEntry[]>(() => parseLinks(raw));

  const add = () =>
    setEntries((prev) => [...prev, { _id: uid(), label: "", url: "" }]);

  const remove = (id: string) =>
    setEntries((prev) => prev.filter((e) => e._id !== id));

  const update = (id: string, key: keyof LinkEntry, value: string) =>
    setEntries((prev) =>
      prev.map((e) => (e._id === id ? { ...e, [key]: value } : e)),
    );

  return (
    <div className="space-y-3 md:col-span-2">
      {entries.length === 0 && (
        <p className="py-2 text-[13px] text-[#8a8a85]">
          Nenhum link adicional. LinkedIn está em Dados pessoais e contato.
        </p>
      )}
      {entries.map((e) => (
        <div
          key={e._id}
          className="grid items-end gap-3 rounded-[10px] border border-[#e3e1d9] bg-white p-4 md:grid-cols-[1fr_2fr_auto]"
        >
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor={`link-label-${e._id}`}>
              Rótulo
            </label>
            <input
              className={inputCls}
              id={`link-label-${e._id}`}
              value={e.label}
              onChange={(ev) => update(e._id, "label", ev.target.value)}
              placeholder="Ex.: Portfólio"
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls} htmlFor={`link-url-${e._id}`}>
              URL
            </label>
            <input
              className={inputCls}
              id={`link-url-${e._id}`}
              value={e.url}
              onChange={(ev) => update(e._id, "url", ev.target.value)}
              placeholder="https://"
              type="url"
            />
          </div>
          <RemoveButton onClick={() => remove(e._id)} />
        </div>
      ))}
      <AddButton label="Adicionar link" onClick={add} />
    </div>
  );
}

// ─── Block content dispatcher ──────────────────────────────────────────────

function BlockContent({
  block,
  profile,
  userEmail,
}: {
  block: ProfileBlockDefinition;
  profile: UserProfileRecord;
  userEmail?: string;
}) {
  const bid = block.id;

  if (bid === "experiencias") {
    return <ExperienciasEditor raw={profile.experiencesJson} />;
  }

  if (bid === "formacao") {
    return <FormacaoEditor raw={profile.educationJson} />;
  }

  if (bid === "habilidades") {
    return <HabilidadesEditor raw={profile.skillsJson} />;
  }

  if (bid === "idiomas") {
    return <IdiomasEditor raw={profile.languagesJson} />;
  }

  if (bid === "certificacoes") {
    return <CertificacoesEditor raw={profile.certificationsJson} />;
  }

  if (bid === "links") {
    return <LinksEditor raw={[]} />;
  }

  // dados-pessoais: custom layout with contactEmail editable + linkedin
  if (bid === "dados-pessoais") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Nome completo"
          id="dp-fullName"
          name="fullName"
          value={profile.fullName ?? ""}
          placeholder="Seu nome completo"
        />
        <Field
          label="Email de contato"
          id="dp-contactEmail"
          name="contactEmail"
          value={profile.contactEmail ?? ""}
          placeholder={userEmail ?? "email@exemplo.com"}
          type="email"
        />
        <Field
          label="Telefone"
          id="dp-phone"
          name="phone"
          value={profile.phone ?? ""}
          placeholder="+55 11 99999-0000"
        />
        <Field
          label="LinkedIn"
          id="dp-linkedin"
          name="linkedinUrl"
          value={profile.linkedinUrl ?? ""}
          placeholder="https://linkedin.com/in/seuperfil"
        />
        <Field
          label="Cidade"
          id="dp-city"
          name="city"
          value={profile.city ?? ""}
          placeholder="São Paulo"
        />
        <Field
          label="Estado"
          id="dp-state"
          name="state"
          value={profile.state ?? ""}
          placeholder="SP"
        />
      </div>
    );
  }

  // Generic renderer for simple field blocks (resumo)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {block.fields.map((field) => {
        const id = getFieldId(block.id, field.name);
        const defaultValue = String(
          getProfileFieldDefaultValue(profile, field),
        );

        if (field.type === "textarea") {
          return (
            <TextareaField
              key={field.name}
              label={field.label}
              id={id}
              name={field.name}
              value={defaultValue}
              rows={field.rows}
            />
          );
        }

        return (
          <Field
            key={field.name}
            label={field.label}
            id={id}
            name={field.name}
            value={defaultValue}
          />
        );
      })}
    </div>
  );
}

// ─── Main block component ──────────────────────────────────────────────────

const CLOSE_MS = 220;

export function CvMasterBlock({
  action,
  clearAction,
  block,
  defaultOpen = false,
  hasGap,
  index,
  isOptional = false,
  profile,
  userEmail,
}: CvMasterBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [closing, setClosing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const state: BlockState = isOptional
    ? "opcional"
    : hasGap
      ? "lacuna"
      : "completo";
  const idx = String(index).padStart(2, "0");

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  };

  const handleToggle = () => {
    if (open || closing) {
      handleClose();
    } else {
      setOpen(true);
    }
  };

  // Scroll card to vertical center after opening
  useEffect(() => {
    if (open && !closing && blockRef.current) {
      const t = setTimeout(() => {
        blockRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
      return () => clearTimeout(t);
    }
  }, [open, closing]);

  return (
    <div
      ref={blockRef}
      className={cn(
        "overflow-hidden rounded-[12px] border bg-[#fafaf6] transition-[border-color,box-shadow] duration-150",
        open
          ? "border-[rgba(10,10,10,0.16)] shadow-[0_10px_28px_-16px_rgba(10,10,10,0.18)]"
          : "border-[rgba(10,10,10,0.08)]",
      )}
      id={block.id}
    >
      <div className="flex w-full items-center px-[18px] py-[14px]">
        {/* Toggle area */}
        <button
          type="button"
          aria-expanded={open && !closing}
          aria-controls={`${block.id}-panel`}
          aria-label={block.title}
          onClick={handleToggle}
          className="flex flex-1 items-center gap-3.5 text-left"
        >
          <span className="w-[18px] shrink-0 font-mono text-[11px] font-medium text-[#8a8a85]">
            {idx}
          </span>
          <span className="flex-1 text-[15px] font-medium tracking-[-0.01em] text-[#0a0a0a]">
            {block.title}
          </span>
          <StateChip state={state} />
          <span
            className="ml-1 text-[#8a8a85] transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
            aria-hidden="true"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4l5 5 5-5" />
            </svg>
          </span>
        </button>

        {/* Clear block — opens confirm dialog */}
        <button
          type="button"
          aria-label={`Limpar ${block.title}`}
          onClick={() => setConfirmingClear(true)}
          className="ml-3 shrink-0 flex h-7 w-7 items-center justify-center rounded-[6px] text-[#b8b6b0] transition-colors hover:bg-[rgba(154,61,40,0.07)] hover:text-[#9a3d28]"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="1 3.5 13 3.5" />
            <path d="M11.5 3.5v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-8" />
            <path d="M4.5 3.5V2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5v1.5" />
          </svg>
        </button>
      </div>

      {/* Hidden form used to submit clearAction after dialog confirmation */}
      <form id={`${block.id}-clear-form`} action={clearAction} className="hidden" />

      {confirmingClear && (
        <ConfirmDialog
          title={`Limpar "${block.title}"?`}
          description="Todos os campos deste bloco serão apagados. A ação pode ser revertida salvando novos valores."
          confirmLabel="Limpar bloco"
          danger
          onConfirm={() => {
            setConfirmingClear(false);
            const form = document.getElementById(
              `${block.id}-clear-form`,
            ) as HTMLFormElement | null;
            form?.requestSubmit();
          }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}

      {(open || closing) && (
        <form
          action={action}
          id={`${block.id}-panel`}
          className={cn(
            "border-t border-[rgba(10,10,10,0.06)]",
            closing ? "cv-block-panel-close" : "cv-block-panel",
          )}
        >
            <input name="focus" type="hidden" value={block.id} />

            <div className="p-5 md:p-6">
              <BlockContent
                block={block}
                profile={profile}
                userEmail={userEmail}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(10,10,10,0.06)] px-5 py-4 md:px-6">
              <p className="text-[12.5px] text-[#5a5a55]">
                {hasGap
                  ? "Salve este bloco para atualizar o perfil."
                  : "Edite apenas o bloco que deseja revisar."}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-[8px] border border-[rgba(10,10,10,0.12)] bg-white px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[rgba(10,10,10,0.04)]"
                  type="button"
                  onClick={handleClose}
                >
                  Cancelar
                </button>
                <button
                  className="rounded-[8px] bg-[#0a0a0a] px-5 py-2 text-[13px] font-medium text-[#fafaf6] transition-colors hover:bg-[#1a1a1a]"
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
