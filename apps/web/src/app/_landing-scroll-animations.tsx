"use client";
import { useEffect } from "react";

export function LandingScrollAnimations() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" },
    );

    for (const el of document.querySelectorAll(".reveal-card")) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return null;
}
