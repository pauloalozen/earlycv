"use client";

import { useEffect, useState } from "react";

export function PageShell({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Revela assim que a tela termina de montar no cliente.
    const timeoutId = setTimeout(() => setReady(true), 100);

    // Restore via bfcache: a página reaparece sem remontar — revela na hora.
    const handlePageShow = () => setReady(true);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  // O cover segura a tela enquanto ela monta (UX: nunca montar na cara do
  // usuário). O JS o remove quando a montagem conclui. Caso o JS nunca rode
  // (restore de bfcache sem hidratação), a animação failsafe em CSS dissolve o
  // cover sozinha — então ele jamais fica preso como spinner infinito.
  return (
    <>
      <div
        className={`page-shell-cover${ready ? " page-shell-cover--ready" : ""}`}
        aria-hidden="true"
      >
        <div className="page-shell-cover-spinner" />
      </div>
      {children}
    </>
  );
}
