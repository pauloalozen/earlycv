"use client";

import { useEffect, useState } from "react";

import { AT } from "./admin-primitives";

// As ações do admin são server actions que terminam em redirect() para a
// MESMA página com ?status=&message= (buildAdminRedirect). O Next trata esse
// redirect como navegação com scroll padrão (server-action-reducer usa
// ScrollBehavior.Default, sem opção de desligar) e joga a página pro topo —
// o admin tinha que rolar de volta até onde estava.
//
// Este componente guarda a posição no submit de qualquer <form> e, enquanto
// o usuário não interage, desfaz o scroll programático que vier depois na
// mesma rota. Não interfere quando: a action leva pra outra rota (ex.: criar
// campanha → /admin/product-updates/<id>), o redirect tem âncora (#result
// em eventos-e-logs) ou o usuário rola/clica/digita enquanto espera.
//
// Como a mensagem de sucesso/erro é renderizada no topo da página, depois
// de restaurar a posição ela também aparece num aviso fixo, senão o admin
// não veria o resultado da ação.

// Tempo máximo esperando a action responder (ingestão pode demorar).
const PENDING_TIMEOUT_MS = 120_000;
// Depois da primeira restauração, segue segurando a posição por um instante:
// o Next pode aplicar mais de um commit na mesma navegação.
const HOLD_AFTER_RESTORE_MS = 1_500;
const TOAST_DURATION_MS = 6_000;

type Pending = {
  pathname: string;
  hash: string;
  search: string;
  y: number;
  startedAt: number;
  restoredAt: number | null;
};

type Toast = { status: "success" | "error"; message: string };

function readToast(search: string): Toast | null {
  const params = new URLSearchParams(search);
  const message = params.get("message");
  const status = params.get("status");
  if (!message || (status !== "success" && status !== "error")) return null;
  return { status, message };
}

export function AdminScrollKeeper() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let pending: Pending | null = null;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;

    function clear() {
      pending = null;
    }

    function onSubmit(event: Event) {
      if (event.defaultPrevented) return;
      pending = {
        pathname: window.location.pathname,
        hash: window.location.hash,
        search: window.location.search,
        y: window.scrollY,
        startedAt: Date.now(),
        restoredAt: null,
      };
    }

    function onScroll() {
      const current = pending;
      if (!current) return;

      const now = Date.now();
      if (
        now - current.startedAt > PENDING_TIMEOUT_MS ||
        (current.restoredAt !== null &&
          now - current.restoredAt > HOLD_AFTER_RESTORE_MS) ||
        window.location.pathname !== current.pathname ||
        (window.location.hash !== "" && window.location.hash !== current.hash)
      ) {
        clear();
        return;
      }

      if (Math.abs(window.scrollY - current.y) < 2) return;

      window.scrollTo(0, current.y);

      if (current.restoredAt === null) {
        current.restoredAt = now;
        const search = window.location.search;
        const next = search !== current.search ? readToast(search) : null;
        if (next) {
          clearTimeout(toastTimer);
          setToast(next);
          toastTimer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
        }
      }
    }

    // Qualquer interação do usuário depois do submit é intenção dele:
    // a partir daí o scroll é dele, não desfazemos nada.
    const userEvents = ["wheel", "touchmove", "keydown", "pointerdown"];

    document.addEventListener("submit", onSubmit);
    window.addEventListener("scroll", onScroll, { passive: true });
    for (const name of userEvents) {
      window.addEventListener(name, clear, { capture: true, passive: true });
    }

    return () => {
      clearTimeout(toastTimer);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("scroll", onScroll);
      for (const name of userEvents) {
        window.removeEventListener(name, clear, { capture: true });
      }
    };
  }, []);

  if (!toast) return null;

  const ok = toast.status === "success";
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        maxWidth: "min(560px, calc(100vw - 32px))",
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 12.5,
        background: ok ? AT.okBg : AT.dangerBg,
        color: ok ? AT.ok : AT.danger,
        border: `1px solid ${ok ? "rgba(31,122,77,0.2)" : "rgba(155,44,44,0.2)"}`,
        boxShadow: "0 6px 20px rgba(10,10,10,0.12)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => setToast(null)}
        aria-label="Fechar aviso"
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
