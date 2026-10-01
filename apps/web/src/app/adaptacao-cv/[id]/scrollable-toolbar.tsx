"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

const BAR_BG = "#cac8c2";
const SCROLL_STEP = 200;
// Largura da área da seta. A barra usa o MESMO valor como scroll-padding para
// que o botão encaixado comece rente à borda da seta.
export const TOOLBAR_ARROW_WIDTH = 34;
// A faixa que rola fica 1px para DENTRO do container (que tem o mesmo fundo) e
// a seta cobre esse pixel também. Em zoom fracionado (90%, 125%...) a faixa e a
// seta são caixas arredondadas de modos diferentes na borda; sem esse pixel
// de folga, uma coluna do botão aparecia entre a seta e a sidebar. (Uma
// máscara na faixa resolvia a fresta, mas borrava o texto da barra inteira.)
const EDGE_INSET_PX = 1;
// A seta é opaca até aqui e esmaece no resto. O botão anterior termina 6px (o
// gap da barra) antes do próximo, que o encaixe de rolagem alinha à borda da
// seta — então nada aparece pela metade.
const ARROW_SOLID_PX = TOOLBAR_ARROW_WIDTH + EDGE_INSET_PX - 6;
// Tolerância de subpixel: scrollLeft/scrollWidth fracionados em telas com zoom.
const EDGE_TOLERANCE = 1;

type ArrowSide = "left" | "right";

function ScrollArrow({
  side,
  onClick,
}: {
  side: ArrowSide;
  onClick: () => void;
}) {
  const isLeft = side === "left";
  return (
    <button
      type="button"
      aria-label={
        isLeft ? "Rolar botões para a esquerda" : "Rolar botões para a direita"
      }
      onClick={onClick}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        [side]: 0,
        width: TOOLBAR_ARROW_WIDTH + EDGE_INSET_PX,
        display: "flex",
        alignItems: "center",
        justifyContent: isLeft ? "flex-start" : "flex-end",
        padding: `0 ${6 + EDGE_INSET_PX}px`,
        border: "none",
        cursor: "pointer",
        color: "#222",
        fontSize: 20,
        lineHeight: 1,
        background: `linear-gradient(to ${isLeft ? "right" : "left"}, ${BAR_BG} ${ARROW_SOLID_PX}px, rgba(202,200,194,0))`,
        zIndex: 2,
      }}
    >
      <span aria-hidden="true">{isLeft ? "‹" : "›"}</span>
    </button>
  );
}

// Barra de ações de UMA linha que rola na horizontal quando não cabe. As setas
// só existem quando há conteúdo escondido naquele lado: some a da esquerda no
// início, some a da direita no fim, e nenhuma aparece se tudo cabe.
export function ScrollableToolbar({
  className,
  style,
  wrapperStyle,
  children,
}: {
  className?: string;
  // Estilo da faixa que rola.
  style?: CSSProperties;
  // Fundo e linha inferior da barra (fora da faixa que rola).
  wrapperStyle?: CSSProperties;
  children: ReactNode;
}) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const update = useCallback(() => {
    if (!scroller) return;
    const { scrollLeft, scrollWidth, clientWidth } = scroller;
    setCanScrollLeft(scrollLeft > EDGE_TOLERANCE);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - EDGE_TOLERANCE);
  }, [scroller]);

  useEffect(() => {
    if (!scroller) return;
    update();

    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    // Largura da barra, dos botões (ex.: rótulo curto/longo) e troca de
    // botões (editar/salvar) mudam o que cabe sem disparar scroll.
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => update());
    const observeChildren = () => {
      resizeObserver?.disconnect();
      resizeObserver?.observe(scroller);
      for (const child of Array.from(scroller.children)) {
        resizeObserver?.observe(child);
      }
    };
    observeChildren();

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeChildren();
            update();
          });
    mutationObserver?.observe(scroller, { childList: true, subtree: true });

    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [scroller, update]);

  const scrollBy = (direction: -1 | 1) => {
    scroller?.scrollBy({ left: direction * SCROLL_STEP, behavior: "smooth" });
  };

  return (
    <div
      style={{
        position: "relative",
        flexShrink: 0,
        background: BAR_BG,
        padding: `0 ${EDGE_INSET_PX}px`,
        ...wrapperStyle,
      }}
    >
      <div ref={setScroller} className={className} style={style}>
        {children}
      </div>
      {canScrollLeft ? (
        <ScrollArrow side="left" onClick={() => scrollBy(-1)} />
      ) : null}
      {canScrollRight ? (
        <ScrollArrow side="right" onClick={() => scrollBy(1)} />
      ) : null}
    </div>
  );
}
