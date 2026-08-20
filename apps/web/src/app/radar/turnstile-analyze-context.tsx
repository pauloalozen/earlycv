"use client";

import Script from "next/script";
import { createContext, type ReactNode, useContext } from "react";
import { useTurnstileToken } from "@/lib/use-turnstile-token";

type TurnstileAnalyzeContextValue = {
  requestToken: () => Promise<string | null>;
};

const TurnstileAnalyzeContext =
  createContext<TurnstileAnalyzeContextValue | null>(null);

// Um único widget invisível do Turnstile compartilhado por todos os cards
// de vaga da listagem — cada AnalyzeCardBtn chamando useTurnstileToken()
// direto criaria um widget por card (até 20 numa página), o que é
// desnecessário e pesa na verificação. Aqui só existe uma instância pra
// página inteira.
export function TurnstileAnalyzeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { turnstileSiteKey, containerRef, requestToken, onScriptReady } =
    useTurnstileToken();

  return (
    <TurnstileAnalyzeContext.Provider value={{ requestToken }}>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={onScriptReady}
        />
      ) : null}
      <div
        ref={containerRef}
        aria-hidden
        style={{
          position: "fixed",
          left: -10000,
          top: -10000,
          width: 320,
          height: 80,
          pointerEvents: "none",
          opacity: 0,
        }}
      />
      {children}
    </TurnstileAnalyzeContext.Provider>
  );
}

// Sem provider (ex: JobCard renderizado isolado em teste, ou qualquer
// lugar que ainda não envolveu a árvore), cai num fallback que nunca
// resolve token — só importa de verdade quando masterResumeId existe,
// caso em que a página real sempre tem o provider por cima.
async function noTokenFallback(): Promise<string | null> {
  return null;
}

export function useTurnstileAnalyzeToken() {
  const ctx = useContext(TurnstileAnalyzeContext);
  return ctx?.requestToken ?? noTokenFallback;
}
