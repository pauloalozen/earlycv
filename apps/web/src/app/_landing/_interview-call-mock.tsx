"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Mockup de videochamada (Google Meet) da Entrevista Simulada: Paulo
 * entrevistando, o candidato na janelinha e a conversa rolando sozinha.
 * Usado no hero de /simulacao-de-entrevista e no FeatureShowcase da landing.
 */

type Line = {
  who: string;
  text: string;
  /** trecho em destaque no final da fala (feedback acionável) */
  strong?: string;
  kind: "paulo" | "me" | "tip";
};

const INITIAL: Line[] = [
  {
    who: "Paulo",
    text: "E qual foi o resultado dessa automação?",
    kind: "paulo",
  },
  { who: "Você", text: "O pessoal do time gostou bastante.", kind: "me" },
  {
    who: "Paulo · pausa no treino",
    text: "Para aqui. Quem avalia quer ver impacto.",
    strong: "Quantas horas isso poupou por semana?",
    kind: "tip",
  },
];

const SCRIPT: Line[] = [
  {
    who: "Você",
    text: "Automatizei 12 relatórios semanais e o time ganhou umas 6 horas por semana.",
    kind: "me",
  },
  {
    who: "Paulo",
    text: "Agora sim. Essa é a resposta de quem entrega resultado.",
    kind: "paulo",
  },
  {
    who: "Paulo",
    text: "Próxima. Me conta de uma vez em que você discordou do seu gestor.",
    kind: "paulo",
  },
  {
    who: "Você",
    text: "Eu costumo concordar com tudo, não gosto de conflito.",
    kind: "me",
  },
  {
    who: "Paulo · pausa no treino",
    text: "Essa resposta preocupa quem contrata.",
    strong: "Traga um caso real em que você defendeu uma ideia com dados.",
    kind: "tip",
  },
  {
    who: "Paulo",
    text: "Bloco técnico. Explica a diferença entre LEFT JOIN e INNER JOIN para alguém de negócio.",
    kind: "paulo",
  },
  {
    who: "Você",
    text: "O INNER traz só o que existe nos dois lados. O LEFT mantém tudo da primeira tabela.",
    kind: "me",
  },
  {
    who: "Paulo",
    text: "Clara e curta. Agora me dá um exemplo do seu dia a dia.",
    kind: "paulo",
  },
  {
    who: "Paulo",
    text: "Pra fechar: você tem alguma pergunta pra mim?",
    kind: "paulo",
  },
  { who: "Você", text: "Não, acho que está tudo certo.", kind: "me" },
  {
    who: "Paulo · pausa no treino",
    text: "Sempre leve duas perguntas.",
    strong: "“Como vocês medem sucesso nos primeiros 90 dias?”",
    kind: "tip",
  },
  {
    who: "Paulo",
    text: "Voltando ao começo: e qual foi o resultado daquela automação?",
    kind: "paulo",
  },
  ...INITIAL.slice(1),
];

const MAX_VISIBLE = 6;
const START_SECONDS = 18 * 60 + 42;

function formatClock(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function InterviewCallMock({ compact = false }: { compact?: boolean }) {
  const [lines, setLines] = useState(() =>
    INITIAL.map((line, i) => ({ ...line, id: i, initial: true })),
  );
  const [seconds, setSeconds] = useState(START_SECONDS);
  const nextId = useRef(INITIAL.length);
  const cursor = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timeout: ReturnType<typeof setTimeout>;
    const step = () => {
      const line = SCRIPT[cursor.current];
      cursor.current = (cursor.current + 1) % SCRIPT.length;
      const id = nextId.current++;
      setLines((prev) =>
        [...prev, { ...line, id, initial: false }].slice(-MAX_VISIBLE),
      );
      timeout = setTimeout(step, line.kind === "tip" ? 4200 : 2800);
    };
    timeout = setTimeout(step, 3800);

    const clock = setInterval(() => {
      setSeconds((s) => (s >= 45 * 60 ? START_SECONDS : s + 1));
    }, 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(clock);
    };
  }, []);

  const speaker = lines[lines.length - 1]?.kind === "me" ? "me" : "paulo";

  return (
    <div
      className={`icm${compact ? " icm-compact" : ""}`}
      data-speaker={speaker}
      role="img"
      aria-label="Exemplo de uma entrevista simulada pelo Google Meet: Paulo pergunta, o candidato responde e recebe feedback na hora."
    >
      <div className="icm-top">
        <span className="icm-live">
          <i />
          Google Meet · Entrevista simulada
        </span>
        <span className="icm-timer">{formatClock(seconds)}</span>
      </div>

      <div className="icm-stage">
        <div className="icm-avatar">PA</div>
        <span className="icm-name">
          <span className="icm-wave">
            <b />
            <b />
            <b />
          </span>
          Paulo · entrevistador
        </span>
        <div className="icm-pip">
          <div className="icm-mini">VC</div>
          <span>Você</span>
        </div>
      </div>

      <div className="icm-chat">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`icm-msg icm-${line.kind}${line.initial ? ` icm-i${line.id + 1}` : ""}`}
          >
            <span className="icm-who">{line.who}</span>
            <p>
              {line.text}
              {line.strong ? (
                <>
                  {" "}
                  <b>{line.strong}</b>
                </>
              ) : null}
            </p>
          </div>
        ))}
      </div>

      <div className="icm-controls">
        <span>
          <svg viewBox="0 0 24 24">
            <title>Microfone</title>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </span>
        <span>
          <svg viewBox="0 0 24 24">
            <title>Câmera</title>
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="M16 10l5-3v10l-5-3" />
          </svg>
        </span>
        <span>
          <svg viewBox="0 0 24 24">
            <title>Chat</title>
            <path d="M4 5h16v11H8l-4 4z" />
          </svg>
        </span>
        <span className="icm-end">
          <svg viewBox="0 0 24 24">
            <title>Encerrar chamada</title>
            <path d="M3 14c5-5 13-5 18 0l-2 3-4-1v-3a10 10 0 0 0-6 0v3l-4 1z" />
          </svg>
        </span>
      </div>

      <style>{ICM_CSS}</style>
    </div>
  );
}

const ICM_CSS = `
.icm {
  --icm-bg: #121210; --icm-tile: #1f1f1c; --icm-tile-2: #2a2a26; --icm-me: #2b2b27;
  --icm-fg: #f4f3ee; --icm-fg-2: #a9a7a0; --icm-line: rgba(250,250,246,0.08);
  --icm-accent: #c6ff3a;
  background: var(--icm-bg); color: var(--icm-fg); border-radius: 18px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 30px 70px -24px rgba(10,10,10,0.45);
  padding: 12px; display: grid; gap: 10px; text-align: left;
  font-family: var(--font-ubuntu), -apple-system, "Segoe UI", system-ui, sans-serif;
}
.icm svg { fill: none; }
.icm-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 4px 6px 2px; font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 11.5px; letter-spacing: .4px; color: var(--icm-fg-2); }
.icm-live { display: inline-flex; align-items: center; gap: 8px; }
.icm-live i { width: 7px; height: 7px; border-radius: 50%; background: #ff4d3d; }
.icm-timer { color: var(--icm-fg); font-variant-numeric: tabular-nums; }
.icm-stage { position: relative; aspect-ratio: 16 / 10; max-width: 100%; border-radius: 12px; background: radial-gradient(120% 90% at 50% 30%, var(--icm-tile-2), var(--icm-tile)); overflow: hidden; display: grid; place-items: center; }
.icm-avatar { position: relative; width: 92px; height: 92px; border-radius: 50%; background: #3a3a35; display: grid; place-items: center; font-size: 30px; font-weight: 500; color: var(--icm-fg); }
.icm-avatar::after { content: ""; position: absolute; inset: -6px; border-radius: 50%; border: 2px solid var(--icm-accent); transition: opacity .3s ease; }
.icm[data-speaker="me"] .icm-avatar::after { opacity: 0; animation: none; }
.icm-name { position: absolute; left: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.45); padding: 5px 9px; border-radius: 6px; font-size: 12px; }
.icm-wave { display: inline-flex; gap: 2px; align-items: flex-end; height: 10px; }
.icm-wave b { width: 2px; height: 4px; background: var(--icm-accent); border-radius: 1px; }
.icm-wave b:nth-child(2) { height: 10px; } .icm-wave b:nth-child(3) { height: 7px; }
.icm[data-speaker="me"] .icm-wave { visibility: hidden; }
.icm-pip { position: absolute; right: 10px; bottom: 10px; width: 28%; aspect-ratio: 4 / 3; border-radius: 8px; background: var(--icm-me); border: 1px solid var(--icm-line); display: grid; place-items: center; transition: box-shadow .3s ease; }
.icm[data-speaker="me"] .icm-pip { box-shadow: 0 0 0 2px var(--icm-accent); }
.icm-mini { width: 34px; height: 34px; border-radius: 50%; background: #45443e; display: grid; place-items: center; font-size: 12px; font-weight: 500; }
.icm-pip span { position: absolute; left: 6px; bottom: 5px; font-size: 10.5px; color: var(--icm-fg-2); }
.icm-chat { display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; padding: 6px 4px 2px; height: 236px; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 44px); mask-image: linear-gradient(to bottom, transparent 0, #000 44px); }
.icm-msg { display: grid; gap: 3px; max-width: 86%; flex-shrink: 0; align-self: flex-start; }
.icm-msg p { margin: 0; background: var(--icm-tile-2); padding: 9px 12px; border-radius: 12px 12px 12px 4px; font-size: 14px; line-height: 1.4; font-weight: 300; }
.icm-msg p b { font-weight: 500; }
.icm-who { font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; color: var(--icm-fg-2); }
.icm-me { align-self: flex-end; text-align: right; }
.icm-me p { background: var(--icm-me); color: var(--icm-fg-2); border-radius: 12px 12px 4px 12px; text-align: left; }
.icm-tip p { background: var(--icm-fg); color: #0a0a0a; font-weight: 400; }
.icm-controls { display: flex; justify-content: center; gap: 10px; padding: 6px 0 4px; }
.icm-controls span { width: 38px; height: 38px; border-radius: 50%; background: var(--icm-tile-2); display: grid; place-items: center; }
.icm-controls .icm-end { background: #e5483b; width: 52px; border-radius: 19px; }
.icm-controls svg { width: 17px; height: 17px; stroke: var(--icm-fg); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.icm-compact .icm-chat { height: 200px; }
@media (prefers-reduced-motion: no-preference) {
  .icm-avatar::after { animation: icm-speak 1.6s ease-in-out infinite; }
  .icm-wave b { animation: icm-wave .9s ease-in-out infinite; }
  .icm-wave b:nth-child(2) { animation-delay: .15s; } .icm-wave b:nth-child(3) { animation-delay: .3s; }
  .icm-msg { animation: icm-rise .5s cubic-bezier(.2,.7,.2,1) both; }
  .icm-i1 { animation-delay: .3s; } .icm-i2 { animation-delay: .7s; } .icm-i3 { animation-delay: 1.1s; }
}
@keyframes icm-speak { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.06); opacity: .55; } }
@keyframes icm-wave { 0%,100% { transform: scaleY(.5); } 50% { transform: scaleY(1.2); } }
@keyframes icm-rise { from { transform: translateY(-10px); opacity: .001; } to { transform: none; opacity: 1; } }
@media (max-width: 480px) {
  .icm-avatar { width: 72px; height: 72px; font-size: 24px; }
  .icm-chat { height: 220px; }
}
`;
