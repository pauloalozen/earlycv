"use client";

import { type ReactNode, useState } from "react";

const MONO = "var(--font-geist-mono), monospace";

type Tab = { id: string; label: string; icon: ReactNode };

type Props = {
  tabs: Tab[];
  columns: Record<string, ReactNode>;
};

// Desktop: as colunas do grid operacional ficam lado a lado sempre (3, ou
// 2 quando "Descoberta" está oculta em ghost mode — ver meu-perfil/page.tsx).
// Mobile (<=900px): viram abas — só a coluna ativa é exibida, evitando o
// empilhamento vertical infinito das seções.
export function DashboardColumnTabs({ tabs, columns }: Props) {
  const [active, setActive] = useState(tabs[0].id);

  return (
    <>
      <style>{`
        .dpt-tabs { display: none; }
        .dpt-grid {
          display: grid;
          grid-template-columns: repeat(${tabs.length}, minmax(0, 1fr));
          gap: 16px;
          align-items: stretch;
        }
        @media (max-width: 900px) {
          .dpt-tabs {
            display: flex;
            gap: 6px;
            margin-bottom: 12px;
            overflow-x: auto;
            scrollbar-width: none;
          }
          .dpt-tabs::-webkit-scrollbar { display: none; }
          .dpt-grid { grid-template-columns: minmax(0, 1fr); }
          .dpt-col[data-active="false"] { display: none; }
        }
        .dpt-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid rgba(10,10,10,0.1);
          background: #fafaf6;
          color: #5a5a55;
          font-family: ${MONO};
          font-size: 10.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          cursor: pointer;
        }
        .dpt-tab--active {
          background: #0a0a0a;
          border-color: #0a0a0a;
          color: #fafaf6;
        }
      `}</style>

      <div className="dpt-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`dpt-tab${active === tab.id ? " dpt-tab--active" : ""}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="dpt-grid">
        {tabs.map((tab) => (
          <div key={tab.id} className="dpt-col" data-active={active === tab.id}>
            {columns[tab.id]}
          </div>
        ))}
      </div>
    </>
  );
}
