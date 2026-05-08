"use client";

import { useState } from "react";

const _MONO = "var(--font-geist-mono), monospace";

const FAQ_ITEMS = [
  {
    q: "A IA inventa experiências que não tenho?",
    a: "Não — essa é a regra mais importante do EarlyCV. O sistema só reorganiza, destaca e adapta o que já está no seu CV. Nunca cria cargos, resultados ou habilidades que você não tem. O que você vê no resultado final existia no seu CV original.",
  },
  {
    q: "Funciona para qualquer área?",
    a: "Funciona bem para a maioria das áreas, mas é especialmente eficaz para tecnologia, dados, produto e analytics — onde os descritivos de vaga têm keywords técnicas específicas que o recrutador e o ATS buscam.",
  },
  {
    q: "Quanto tempo leva para receber o CV adaptado?",
    a: "Menos de 60 segundos após você enviar o CV e colar a descrição da vaga. A análise e a geração do CV adaptado acontecem em tempo real — na maioria dos casos você já está lendo o resultado antes de 1 minuto.",
  },
  {
    q: "Posso usar os créditos para diferentes vagas?",
    a: "Sim. Cada crédito = uma adaptação para qualquer vaga que você quiser. Pode usar tudo de uma vez ou guardar para usar ao longo do tempo. Os créditos não expiram.",
  },
  {
    q: "Isso substitui revisão humana do currículo?",
    a: "O EarlyCV resolve um problema específico: adaptar rapidamente o posicionamento do seu CV para cada vaga. Para revisão profunda de carreira ou mentoria ainda faz sentido um profissional. Mas para mandar currículo sem perder tempo — aqui é o lugar certo.",
  },
];

export function AnimatedFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div>
      {FAQ_ITEMS.map(({ q, a }, i) => {
        const isOpen = openIdx === i;
        return (
          <div
            key={q}
            style={{ borderBottom: "1px solid rgba(10,10,10,0.08)" }}
          >
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? null : i)}
              style={{
                width: "100%",
                padding: "18px 0",
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 400,
                color: isOpen ? "#3a6e10" : "#0a0a0a",
                background: "none",
                border: "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                textAlign: "left",
                transition: "color 0.2s",
                fontFamily: "inherit",
              }}
            >
              {q}
              <span
                style={{
                  color: "#8a8a85",
                  fontSize: 20,
                  flexShrink: 0,
                  lineHeight: 1,
                  display: "inline-block",
                  transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                  transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                +
              </span>
            </button>
            <div
              style={{
                overflow: "hidden",
                maxHeight: isOpen ? 400 : 0,
                opacity: isOpen ? 1 : 0,
                transition:
                  "max-height 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "#5a5a55",
                  lineHeight: 1.7,
                  paddingBottom: 20,
                  margin: 0,
                  fontFamily: "inherit",
                }}
              >
                {a}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
