"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const FONT_FAMILIES = [
  "var(--font-sans)",
  "var(--font-serif)",
  "var(--font-display)",
  "var(--font-script)",
];

const HALF_DURATION = 220;
const STAGGER = 70;
const PAUSE = 3000;

type LetterEntry = { uid: string; letter: string; index: number };

type FontMetrics = {
  containerWidth: number;
  // paddingTop per font to keep the CSS baseline at a fixed y inside the container
  ascentAdjustments: number[];
};

function resolveFontFamily(cssVar: string, container: HTMLElement): string {
  const el = document.createElement("span");
  el.style.cssText = `position:absolute;visibility:hidden;font-family:${cssVar}`;
  container.appendChild(el);
  const family = window.getComputedStyle(el).fontFamily;
  el.remove();
  return family;
}

function getPrimaryFontFamily(familyList: string): string {
  const [primary] = familyList.split(",");
  return primary?.trim() ?? familyList;
}

function measureFonts(container: HTMLSpanElement, word: string): FontMetrics {
  const computed = window.getComputedStyle(container);
  const fontSize = parseFloat(computed.fontSize);
  const fontWeight = computed.fontWeight;

  // Canvas measures the real ink box (captures Dancing Script 'f' ascender/descender)
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(fontSize * word.length * 2);
  canvas.height = Math.ceil(fontSize * 4);
  // biome-ignore lint/style/noNonNullAssertion: canvas always has a 2d context
  const ctx = canvas.getContext("2d")!;

  // DOM baseline marker for layout ascent (drives paddingTop calculation)
  const wrapper = document.createElement("span");
  wrapper.style.cssText = "position:absolute;visibility:hidden;top:0;left:0";
  document.body.appendChild(wrapper);

  const textEl = document.createElement("span");
  textEl.style.cssText = `font-size:${computed.fontSize};font-weight:${fontWeight};line-height:1;white-space:nowrap`;
  textEl.textContent = word;

  // Zero-height marker aligned on the CSS baseline
  const marker = document.createElement("span");
  marker.style.cssText =
    "display:inline-block;width:0;height:0;vertical-align:baseline";

  wrapper.appendChild(textEl);
  wrapper.appendChild(marker);

  const data = FONT_FAMILIES.map((cssVar) => {
    const resolvedFamily = resolveFontFamily(cssVar, container);
    ctx.font = `${fontWeight} ${fontSize}px ${resolvedFamily}`;
    const cm = ctx.measureText(word);

    textEl.style.fontFamily = cssVar;
    const tRect = textEl.getBoundingClientRect();
    const mRect = marker.getBoundingClientRect();

    return {
      canvasWidth: cm.width,
      inkAscent: cm.actualBoundingBoxAscent,
      inkDescent: cm.actualBoundingBoxDescent,
      layoutAscent: mRect.top - tRect.top,
    };
  });

  document.body.removeChild(wrapper);

  // maxAscent = max of ink vs layout ascent across all fonts + safety margin
  const maxAscent =
    Math.max(...data.map((d) => Math.max(d.inkAscent, d.layoutAscent))) + 4;
  const maxWidth = Math.max(...data.map((d) => d.canvasWidth));

  return {
    containerWidth: Math.ceil(maxWidth) + 2,
    // paddingTop pushes each font's text down so its CSS baseline lands at
    // exactly maxAscent pixels from the top of the container (same y for all fonts)
    ascentAdjustments: data.map((d) => Math.round(maxAscent - d.layoutAscent)),
  };
}

export function FlipWord({ word }: { word: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const fontIndexRef = useRef(0);
  const metricsRef = useRef<FontMetrics | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [layerOffsetTop, setLayerOffsetTop] = useState(0);

  const letters: LetterEntry[] = useMemo(
    () =>
      word
        .split("")
        .map((letter, i) => ({ uid: `${word}-${i}`, letter, index: i })),
    [word],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    setIsReady(false);
    setLayerOffsetTop(0);

    const apply = async () => {
      const computed = window.getComputedStyle(container);
      const fontSize = computed.fontSize;
      const fontWeight = computed.fontWeight;

      // Explicitly load every font before measuring.
      // document.fonts.ready only guarantees fonts currently in the render tree —
      // the animation fonts (serif, display, script) may not be loaded yet.
      await Promise.all(
        FONT_FAMILIES.map(async (cssVar) => {
          const family = resolveFontFamily(cssVar, container);
          const primaryFamily = getPrimaryFontFamily(family);
          const fontDeclaration = `${fontWeight} ${fontSize} ${primaryFamily}`;

          try {
            await document.fonts.load(fontDeclaration);
            if (!document.fonts.check(fontDeclaration)) {
              await document.fonts.ready;
            }
          } catch {
            // best-effort: proceed with whatever is available
          }
        }),
      );

      if (cancelled) return;

      const m = measureFonts(container, word);
      metricsRef.current = m;

      container.style.width = `${m.containerWidth}px`;

      for (const el of letterRefs.current) {
        if (el) el.style.paddingTop = `${m.ascentAdjustments[0]}px`;
      }

      setLayerOffsetTop(m.ascentAdjustments[0]);

      setIsReady(true);
    };

    apply();

    return () => {
      cancelled = true;
    };
  }, [word]);

  useEffect(() => {
    if (!isReady) return;

    const letterList = word.split("");
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    function flipLetter(
      el: HTMLSpanElement,
      nextFontIdx: number,
      startDelay: number,
    ) {
      const t1 = setTimeout(() => {
        el.style.transition = `transform ${HALF_DURATION}ms ease-in`;
        el.style.transform = "rotateY(90deg)";
      }, startDelay);

      const t2 = setTimeout(() => {
        const m = metricsRef.current;
        el.style.transition = "none";
        el.style.transform = "rotateY(-90deg)";
        el.style.fontFamily = FONT_FAMILIES[nextFontIdx];
        if (m) el.style.paddingTop = `${m.ascentAdjustments[nextFontIdx]}px`;
        void el.offsetWidth;
        el.style.transition = `transform ${HALF_DURATION}ms ease-out`;
        el.style.transform = "rotateY(0deg)";
      }, startDelay + HALF_DURATION);

      timeouts.push(t1, t2);
    }

    function runCycle() {
      const nextFontIdx = (fontIndexRef.current + 1) % FONT_FAMILIES.length;

      letterList.forEach((_, i) => {
        const el = letterRefs.current[i];
        if (!el) return;
        flipLetter(el, nextFontIdx, i * STAGGER);
      });

      const totalDuration =
        (letterList.length - 1) * STAGGER + HALF_DURATION * 2;

      const tDone = setTimeout(() => {
        fontIndexRef.current = nextFontIdx;
        const tNext = setTimeout(runCycle, PAUSE);
        timeouts.push(tNext);
      }, totalDuration);

      timeouts.push(tDone);
    }

    const initialTimer = setTimeout(runCycle, PAUSE);
    timeouts.push(initialTimer);

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [isReady, word]);

  return (
    <span
      ref={containerRef}
      className="inline-block"
      style={{
        overflow: "visible",
        verticalAlign: "baseline",
        lineHeight: "inherit",
        position: "relative",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          whiteSpace: "nowrap",
          transform: `translateY(-${layerOffsetTop}px)`,
        }}
      >
        {letters.map(({ uid, letter, index }) => (
          <span
            key={uid}
            ref={(el) => {
              letterRefs.current[index] = el;
            }}
            style={{
              display: "inline-block",
              perspective: "600px",
              lineHeight: "1",
              transform: "rotateY(0deg)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {letter}
          </span>
        ))}
      </span>

      <span
        style={{
          visibility: "hidden",
          whiteSpace: "nowrap",
          lineHeight: "inherit",
          display: "inline-block",
          fontFamily: "var(--font-sans)",
        }}
      >
        {word}
      </span>
    </span>
  );
}
