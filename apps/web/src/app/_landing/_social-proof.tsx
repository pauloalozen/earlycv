"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const STAR_PATH =
  "M12 .587l3.668 7.431 8.2 1.192-5.934 5.785 1.401 8.169L12 18.896l-7.335 3.868 1.401-8.169L.132 9.21l8.2-1.192z";

function starsSVG(n: number) {
  return Array.from(
    { length: n },
    () =>
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`,
  ).join("");
}

const DATA = [
  {
    q: "Eu achava que estava arrasando com meu currículo, mas a análise mostrou pontos importantes. Foi <em>detalhada e fácil de usar</em>.",
    name: "Profissional em transição",
    av: "CA",
  },
  {
    q: "Achei muito interessante a ferramenta. É <em>mais prática que outras do mercado</em> que eu já tinha usado.",
    name: "Comparou com outras ferramentas",
    av: "CZ",
  },
  {
    q: "Tirei 52 de pontuação em uma vaga que achava condizente, e a análise encontrou <em>sugestões que outras ferramentas não apontaram</em>.",
    name: "Usuário em busca de recolocação",
    av: "PA",
  },
  {
    q: "Achei a plataforma <em>simples de utilizar</em> e a análise foi bem prática.",
    name: "Feedback recebido após teste",
    av: "FZ",
  },
  {
    q: "A ferramenta encontrou pontos que meu uso manual de IA <em>não tinha identificado</em>.",
    name: "Testou com IA antes",
    av: "MS",
  },
  {
    q: "No final, já saí com o currículo pronto para me candidatar. <em>Ninguém merece ajustar currículo na mão para toda vaga</em>.",
    name: "Usuária EarlyCV",
    av: "AA",
  },
];

const INTERVAL = 6200;

export function SocialProofSection() {
  // Outer section ref — used for IntersectionObserver (carousel start)
  const sectionRef = useRef<HTMLElement>(null);
  // Stage ref — used for hover pause (only the cards area, not header/CTA)
  const stageRef = useRef<HTMLDivElement>(null);

  const innerRef = useRef<HTMLDivElement>(null);
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const avRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef<HTMLSpanElement>(null);
  const starsRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const inner = innerRef.current;
    const quoteEl = quoteRef.current;
    const nameEl = nameRef.current;
    const avEl = avRef.current;
    const idxEl = idxRef.current;
    const featStars = starsRef.current;
    const bar = barRef.current;
    const chips = chipsRef.current.filter(Boolean) as HTMLButtonElement[];

    if (
      !section ||
      !stage ||
      !inner ||
      !quoteEl ||
      !nameEl ||
      !avEl ||
      !idxEl ||
      !featStars ||
      !bar
    )
      return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let idx = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let paused = false;
    let started = false;

    featStars.innerHTML = starsSVG(5);
    for (const c of chips) {
      const el = c.querySelector(".sp-chip-stars");
      if (el) el.innerHTML = starsSVG(5);
    }

    function paint(i: number) {
      const d = DATA[i];
      quoteEl.innerHTML = d.q;
      nameEl.textContent = d.name;
      avEl.textContent = d.av;
      idxEl.textContent = String(i + 1).padStart(2, "0");
      for (const c of chips) {
        const on = Number(c.getAttribute("data-i")) === i;
        c.classList.toggle("is-active", on);
        c.setAttribute("aria-selected", on ? "true" : "false");
      }
      featStars.classList.remove("reveal");
      void featStars.offsetWidth;
      featStars.classList.add("reveal");
    }

    function restartBar() {
      if (reduce) {
        bar.style.width = "0";
        return;
      }
      bar.style.transition = "none";
      bar.style.width = "0";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (paused) return;
          bar.style.transition = `width ${INTERVAL}ms linear`;
          bar.style.width = "100%";
        });
      });
    }

    function pauseBar() {
      const w = getComputedStyle(bar).width;
      bar.style.transition = "none";
      bar.style.width = w;
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      if (reduce || paused) return;
      timer = setTimeout(() => go(idx + 1, false), INTERVAL);
    }

    function go(i: number, user: boolean) {
      const next = ((i % DATA.length) + DATA.length) % DATA.length;
      if (next === idx && user) {
        schedule();
        restartBar();
        return;
      }
      idx = next;
      if (reduce) {
        paint(idx);
        restartBar();
        schedule();
        return;
      }
      inner.classList.add("is-leaving");
      setTimeout(() => {
        paint(idx);
        inner.classList.remove("is-leaving");
      }, 300);
      restartBar();
      schedule();
    }

    paint(0);

    // Chip clicks
    for (const c of chips) {
      c.addEventListener("click", () => {
        paused = false;
        go(Number(c.getAttribute("data-i")), true);
      });
    }

    // Hover pause — attached to the stage div only, not the whole section.
    // This avoids spurious pause triggers when the cursor enters/leaves the
    // header or CTA areas that lie outside the card grid.
    const onEnter = () => {
      paused = true;
      if (timer) clearTimeout(timer);
      pauseBar();
    };
    const onLeave = () => {
      paused = false;
      restartBar();
      schedule();
    };
    stage.addEventListener("mouseenter", onEnter);
    stage.addEventListener("mouseleave", onLeave);

    // Start carousel when section enters viewport
    function start() {
      if (started) return;
      started = true;
      restartBar();
      schedule();
    }

    // threshold:0 — any visible pixel triggers start
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              start();
              io?.disconnect();
            }
          }
        },
        { threshold: 0 },
      );
      io.observe(section);
    }

    const rect = section.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh && rect.bottom > 0) start();

    const fallback = setTimeout(start, 800);

    return () => {
      if (timer) clearTimeout(timer);
      clearTimeout(fallback);
      io?.disconnect();
      stage.removeEventListener("mouseenter", onEnter);
      stage.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    /*
     * Outer section is full-width so the background covers the whole row.
     * Inner .social-proof div carries the max-width + padding from CSS.
     */
    <section
      ref={sectionRef}
      id="prova-social"
      aria-labelledby="sp-title"
      style={{
        position: "relative",
        zIndex: 2,
        borderTop: "1px solid rgba(10,10,10,0.06)",
        scrollMarginTop: "61px",
        // Warm paper tint — distinct from Como Funciona (rgba(255,255,255,0.45))
        // and Preços (no background, shows radial gradient directly).
        background: "rgba(243,241,236,0.55)",
      }}
    >
      <div className="social-proof" data-screen-label="Prova Social">
        <header className="sp-head">
          <span className="sp-seal">
            <span className="dot" />
            Feedbacks reais · anonimizados
          </span>
          <h2 className="sp-title" id="sp-title">
            O currículo não estava ruim.
            <br />
            Estava <em>desalinhado</em> para a vaga.
          </h2>
          <p className="sp-sub">
            Esses são feedbacks reais de quem usou. Nenhum dado pessoal foi
            exibido.
          </p>
        </header>

        {/* Hover pause is scoped to this div — not the whole section */}
        <div ref={stageRef} className="sp-stage">
          <article
            className="sp-feature reveal-card"
            aria-live="polite"
            style={{ transitionDelay: "0s" }}
          >
            <div className="sp-feature-top">
              <span ref={starsRef} className="sp-stars" aria-hidden="true" />
              <span className="sp-index">
                <b ref={idxRef}>01</b> /{" "}
                <span>{String(DATA.length).padStart(2, "0")}</span>
              </span>
            </div>
            <div ref={innerRef} className="sp-feature-inner">
              <p ref={quoteRef} className="sp-quote" />
              <div className="sp-id">
                <div ref={avRef} className="sp-avatar" aria-hidden="true" />
                <div>
                  <div ref={nameRef} className="sp-name" />
                  <div className="sp-meta">Feedback anonimizado</div>
                </div>
              </div>
            </div>
            <div className="sp-progress">
              <div ref={barRef} className="sp-progress-bar" />
            </div>
          </article>

          <div
            className="sp-roster reveal-card"
            role="tablist"
            aria-label="Feedbacks"
            style={{ transitionDelay: "0.1s" }}
          >
            {DATA.map((d, i) => (
              <button
                key={d.av}
                ref={(el) => {
                  chipsRef.current[i] = el;
                }}
                className="sp-chip"
                data-i={i}
                role="tab"
                type="button"
              >
                <div className="sp-chip-top">
                  <span className="sp-chip-av" aria-hidden="true">
                    {d.av}
                  </span>
                  <span className="sp-chip-stars" />
                </div>
                <span className="sp-chip-role">{d.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sp-cta">
          <span className="sp-cta-hint">Teste com uma vaga real</span>
          <Link href="/adaptar" className="sp-btn lp-cta-primary">
            <span>Analisar meu CV grátis</span>
            <span className="lp-cta-arrow">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
