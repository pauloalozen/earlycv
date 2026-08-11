"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

function ArrowButton({
  direction,
  onClick,
}: {
  direction: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={
        direction === "left" ? "Rolar para trás" : "Rolar para frente"
      }
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none">
        <title>{direction === "left" ? "Voltar" : "Avançar"}</title>
        <path
          d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
          stroke="#0a0a0a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function Carousel({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function checkOverflow() {
      if (!track) return;
      setCanScroll(track.scrollWidth > track.clientWidth + 1);
    }

    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const scroll = (direction: 1 | -1) => {
    trackRef.current?.scrollBy({
      left: direction * 280,
      behavior: "smooth",
    });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        {title}
        {canScroll ? (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <ArrowButton direction="left" onClick={() => scroll(-1)} />
            <ArrowButton direction="right" onClick={() => scroll(1)} />
          </div>
        ) : null}
      </div>
      <style>{`
        .vagas-carousel-track { scrollbar-width: none; -ms-overflow-style: none; }
        .vagas-carousel-track::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        ref={trackRef}
        className="vagas-carousel-track"
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
        }}
      >
        {children}
      </div>
    </div>
  );
}
