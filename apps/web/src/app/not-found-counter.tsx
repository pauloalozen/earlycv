"use client";

import { useEffect, useState } from "react";

export function NotFoundCounter() {
  const [counter, setCounter] = useState("000");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 1_200;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - p) ** 3;
      const value = Math.round(404 * eased);

      setCounter(String(value).padStart(3, "0"));
      setProgress(eased * 72);

      if (p < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }

      setCounter("404");
      setProgress(72);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <div className="mb-1 font-[var(--font-geist)] text-[88px] leading-[0.9] tracking-[-5px] text-[#0a0a0a] font-medium tabular-nums">
        {counter}
      </div>
      <div className="mb-[18px] font-mono text-[10px] tracking-[1.2px] text-[#8a8a85]">
        STATUS CODE
      </div>
      <div className="border-t border-[#0a0a0a12] pt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10.5px] font-medium text-[#8a8a85]">
            PROCURANDO PÁGINA
          </span>
          <div className="h-1 w-[120px] overflow-hidden rounded-full bg-[#0a0a0a14]">
            <div
              className="h-full rounded-full bg-[#f5c518] transition-[width] duration-75 linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
