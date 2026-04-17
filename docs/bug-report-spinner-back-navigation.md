# Bug Report: Spinner trava no back/forward navigation

**Data:** 2026-04-15  
**Severidade:** Alta (bloqueia uso normal da aplicação)  
**Status:** Não resolvido após 2 dias e múltiplas tentativas

---

## Descrição do problema

Dois bugs relacionados ao sistema de transição de rotas (spinner de carregamento):

### Bug 1 — `/planos` → Back → `/dashboard`: tela trava no spinner
Ao clicar no botão Voltar do navegador partindo de `/planos` para `/dashboard`, a tela fica presa no overlay de spinner em tela cheia. O único recovery é recarregar a página.

### Bug 2 — `/dashboard` → `/adaptar`: tela pisca / "abre 2 vezes"
Ao navegar de `/dashboard` para `/adaptar` (forward ou back), a tela apresenta um flash visual — o conteúdo parece aparecer duas vezes ou piscar antes de estabilizar.

---

## Arquitetura do sistema de transição

O sistema tem **três componentes independentes** de spinner:

### 1. `apps/web/src/app/template.tsx` (root template)
- Envolve **todas** as rotas via Next.js App Router `template.tsx`
- `template.tsx` é recriado a cada navegação (diferente de `layout.tsx`)
- Controla um overlay de tela cheia com estado `loading → revealing → done`
- Exceções explícitas: `/` e `/planos` não mostram spinner (`shouldSkipRouteTransition`)
- Detecta back/forward via `popstate` (client-side) e `pageshow` com `event.persisted` (bfcache)

### 2. `apps/web/src/app/planos/planos-focus-remount.tsx`
- Wrapper específico da página `/planos`
- Tem seu **próprio** spinner independente do root template
- O root template delega para este componente (pula seu próprio spinner em `/planos`)
- Originalmente ouvia `focus`, `popstate` e `visibilitychange` para re-montar ao retornar à aba

### 3. `apps/web/src/app/adaptar/template.tsx`
- Passthrough puro (`return children`) — sem spinner
- Existe para **evitar** que o root template anide seu próprio template no `/adaptar`

### CSS das animações (`globals.css`)
```css
.route-transition-overlay { position: fixed; inset: 0; z-index: 70; ... }
.route-transition-overlay--exit { animation: route-overlay-exit 180ms ease-out forwards; }
.route-transition-content--loading { opacity: 0; }
.route-transition-content--revealing { animation: route-content-reveal 340ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.route-transition-content--done { opacity: 1; transform: none; }

@keyframes route-overlay-exit { from { opacity: 1; } to { opacity: 0; visibility: hidden; } }
@keyframes route-content-reveal { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
```

**Timing das animações:**
- `t1` (180ms): `loading → revealing` (overlay começa a sair, conteúdo começa a entrar)
- `t2` (180ms + 340ms = 520ms): `revealing → done`
- `t3` (2500ms): safety timer

---

## Estado atual do código

### `apps/web/src/app/template.tsx`

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type TransitionPhase = "loading" | "revealing" | "done";

const MIN_SPINNER_MS = 180;
const REVEAL_MS = 340;
const SAFETY_TIMEOUT_MS = 2500;
const BACK_FORWARD_WINDOW_MS = 3500;

function shouldSkipRouteTransition(pathname: string): boolean {
  return pathname === "/" || pathname === "/planos";
}

let lastBackForwardAt = 0;
function wasRecentBackForwardNavigation(): boolean {
  if (typeof window === "undefined") return false;
  return Date.now() - lastBackForwardAt < BACK_FORWARD_WINDOW_MS;
}

const phaseDoneCallbacks = new Set<() => void>();
let activeTransitionTimers: number[] = [];

function cancelActiveTransitionTimers() {
  for (const id of activeTransitionTimers) window.clearTimeout(id);
  activeTransitionTimers = [];
}

// Module-level listeners — registrados uma vez, nunca removidos
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return; // Só bfcache restores
    lastBackForwardAt = Date.now();
    cancelActiveTransitionTimers();
    for (const fn of phaseDoneCallbacks) fn();
  });

  window.addEventListener("popstate", () => {
    lastBackForwardAt = Date.now();
    cancelActiveTransitionTimers();
    for (const fn of phaseDoneCallbacks) fn();
  });
}

export default function Template({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const genRef = useRef(0);

  const [phase, setPhase] = useState<TransitionPhase>(() => {
    if (typeof window === "undefined") return "loading";
    if (shouldSkipRouteTransition(pathname)) return "done";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "done";
    const navigationEntry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming | undefined;
    if (navigationEntry?.type === "back_forward") return "done";
    if (wasRecentBackForwardNavigation()) return "done";
    return "loading";
  });

  // Registra callback para bfcache restore e popstate — sem cleanup intencional
  useEffect(() => {
    const fn = () => setPhase("done");
    phaseDoneCallbacks.add(fn);
  }, []);

  useEffect(() => {
    if (shouldSkipRouteTransition(pathname)) { setPhase("done"); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPhase("done"); return; }
    if (wasRecentBackForwardNavigation()) { setPhase("done"); return; }

    genRef.current += 1;
    const myGen = genRef.current;
    setPhase("loading");

    const t1 = window.setTimeout(() => {
      if (genRef.current !== myGen) return;
      setPhase("revealing");
    }, MIN_SPINNER_MS);

    const t2 = window.setTimeout(() => {
      if (genRef.current !== myGen) return;
      setPhase("done");
    }, MIN_SPINNER_MS + REVEAL_MS);

    activeTransitionTimers = [t1, t2];

    // Safety timer — NÃO cancelado no cleanup
    window.setTimeout(() => {
      if (genRef.current !== myGen) return;
      setPhase("done");
    }, SAFETY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      activeTransitionTimers = activeTransitionTimers.filter(id => id !== t1 && id !== t2);
    };
  }, [pathname]);

  return (
    <>
      {phase !== "done" && (
        <div
          className={`route-transition-overlay ${phase === "revealing" ? "route-transition-overlay--exit" : ""}`}
          role="status" aria-live="polite" aria-atomic="true"
        >
          <div className="route-transition-spinner" aria-hidden="true" />
          <span className="sr-only">Loading page content</span>
        </div>
      )}
      <div
        className={`route-transition-content route-transition-content--${phase}`}
        aria-busy={phase !== "done"}
      >
        {children}
      </div>
    </>
  );
}
```

### `apps/web/src/app/planos/planos-focus-remount.tsx`

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

type TransitionPhase = "loading" | "revealing" | "done";

const MIN_SPINNER_MS = 180;
const REVEAL_MS = 340;
const SAFETY_TIMEOUT_MS = 2500;

export function PlanosFocusRemount({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<TransitionPhase>("loading");
  const [focusVersion, setFocusVersion] = useState(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const clearTimers = () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current = [];
    };

    const startTransition = () => {
      setPhase("loading");
      setFocusVersion(current => current + 1);
      clearTimers();
      const t1 = window.setTimeout(() => setPhase("revealing"), MIN_SPINNER_MS);
      const t2 = window.setTimeout(() => setPhase("done"), MIN_SPINNER_MS + REVEAL_MS);
      const t3 = window.setTimeout(() => setPhase("done"), SAFETY_TIMEOUT_MS);
      timersRef.current = [t1, t2, t3];
    };

    const remountWhenReady = () => {
      // Guard: não disparar se usuário já navegou para fora de /planos
      if (window.location.pathname !== "/planos") return;
      const visible = document.visibilityState === "visible";
      if (!visible) return;
      startTransition();
    };

    startTransition(); // Sempre roda no mount

    // `focus` foi removido: o botão Back pode roubar/restaurar foco brevemente
    // `popstate` foi removido: disparava ao navegar PARA FORA de /planos
    window.addEventListener("pageshow", remountWhenReady);
    document.addEventListener("visibilitychange", remountWhenReady);

    return () => {
      clearTimers();
      window.removeEventListener("pageshow", remountWhenReady);
      document.removeEventListener("visibilitychange", remountWhenReady);
    };
  }, []);

  return (
    <>
      {phase !== "done" && (
        <div
          className={`route-transition-overlay ${phase === "revealing" ? "route-transition-overlay--exit" : ""}`}
          role="status" aria-live="polite" aria-atomic="true"
        >
          <div className="route-transition-spinner" aria-hidden="true" />
          <span className="sr-only">Loading page content</span>
        </div>
      )}
      <div
        key={focusVersion}
        className={`route-transition-content route-transition-content--${phase}`}
        aria-busy={phase !== "done"}
      >
        {children}
      </div>
    </>
  );
}
```

---

## Histórico de tentativas

### Tentativa 1 — `forceReleaseTransitionDom()`
**O que foi:** Função que chamava `overlay.remove()` diretamente em nós DOM gerenciados pelo React para forçar a remoção do overlay.  
**Problema:** Quando o React tentava fazer `parentNode.removeChild(overlayNode)` durante reconciliação, o nó já estava detachado → `NotFoundError`. Conflito com o ciclo de vida do React.  
**Resultado:** Removida. Não resolveu o bug principal.

### Tentativa 2 — Cancelar timers t1/t2 no popstate
**O que foi:** Adicionado `activeTransitionTimers` (array module-level) e `cancelActiveTransitionTimers()` chamado no handler `popstate`, para evitar que `t1` (180ms) disparasse `setPhase("revealing")` depois que `popstate` já chamou `setPhase("done")`.  
**Resultado:** Correto mas insuficiente. Não resolveu o travamento.

### Tentativa 3 — Corrigir falso positivo do `pageshow` na carga inicial
**O que foi:** O handler `pageshow` original setava `lastBackForwardAt = Date.now()` mesmo em `event.persisted = false` (carga inicial). Isso fazia a primeira navegação forward pular o spinner.  
**Fix:** Adicionado `if (!event.persisted) return` no início do handler.  
**Resultado:** Fix correto, mas não relacionado ao travamento.

### Tentativa 4 — Remover listener `popstate` do `PlanosFocusRemount`
**O que foi:** `PlanosFocusRemount` tinha listener `popstate` que chamava `startTransition()`. Isso disparava ao navegar PARA FORA de `/planos` (ex: Back → `/dashboard`), iniciando uma nova transição enquanto o componente estava sendo desmontado.  
**Resultado:** Removido. Não resolveu o travamento em `/planos` → `/dashboard`.

### Tentativa 5 — Remover listener `focus` do `PlanosFocusRemount`
**O que foi:** O botão Back pode brevemente roubar e restaurar o foco da janela, disparando o evento `focus` em `PlanosFocusRemount` ainda enquanto em `/planos`, iniciando uma nova transição desnecessária.  
**Resultado:** Removido. Não resolveu.

### Tentativa 6 — Remover `onAnimationEnd` do overlay
**O que foi:** O overlay tinha `onAnimationEnd` que chamava `setPhase("done")` ao terminar a animação de saída (180ms). Isso conflitava com a animação de conteúdo (340ms), que ainda estava rodando — resultando em salto visual / "abre 2 vezes".  
**Resultado:** Removido. Não resolveu o flash em `/dashboard` → `/adaptar`.

### Tentativa 7 — Guard de pathname no `PlanosFocusRemount`
**O que foi:** Adicionado `if (window.location.pathname !== "/planos") return` em `remountWhenReady` para evitar que `pageshow` e `visibilitychange` disparassem durante uma navegação de saída.  
**Resultado:** Não resolveu o travamento.

---

## Hipóteses não descartadas

### Para o Bug 1 (`/planos` → Back → `/dashboard` trava)

**H1: React Strict Mode** — Em desenvolvimento, o React monta/desmonta/remonta efeitos. O primeiro `startTransition()` do `PlanosFocusRemount` roda no primeiro mount, o cleanup cancela os timers, e o segundo mount dispara `startTransition()` novamente. Se o pathname mudou entre esses dois mounts (durante a navegação de back), o segundo mount pode rodar com pathname `/dashboard` mas ainda com o componente `PlanosFocusRemount` vivo por um tick.

**H2: `phaseDoneCallbacks` acumulando entradas stale** — O Set nunca tem entradas removidas (intencional). Em Strict Mode, cada mount adiciona uma entrada. Quando `popstate` dispara, todas as entradas são chamadas, mas cada `setPhase("done")` é aplicado à instância certa? Stale closures podem estar chamando `setPhase` de instâncias antigas.

**H3: Timing do `popstate` vs montagem do novo `Template`** — `popstate` dispara, seta `lastBackForwardAt`, chama `setPhase("done")` para a instância atual de `/planos`. Mas o Next.js App Router cria um **novo** `Template` para `/dashboard`. Esse novo Template roda seu `useState` initializer: `wasRecentBackForwardNavigation()` deve retornar `true` e inicializar como `"done"`. Se por algum motivo `lastBackForwardAt` não está sendo lido corretamente no novo Template (ex: módulo re-carregado, SSR/hydration mismatch), inicializa como `"loading"` e trava.

**H4: O spinner que trava é do `PlanosFocusRemount`, não do root `Template`** — Se `PlanosFocusRemount` ainda está montado quando o Back é pressionado, e o `pageshow` dispara (bfcache restore), o guard `window.location.pathname !== "/planos"` poderia ser `true` por um tick antes da URL mudar, permitindo que `startTransition()` rode. Porém `pageshow` com `event.persisted=false` (não é bfcache) não seria tratado... a menos que seja bfcache.

### Para o Bug 2 (`/dashboard` → `/adaptar` pisca / "abre 2 vezes")

**H5: Duplo Template** — A rota `/adaptar` tem seu próprio `template.tsx` (passthrough). O Next.js pode estar renderizando tanto o root `template.tsx` quanto o `adaptar/template.tsx`. O root Template inicia com `loading`, o adaptar Template simplesmente retorna `children`. Mas se houver algum conflito de z-index ou se o root Template não estiver corretamente inicializado para `/adaptar`...

**H6: Strict Mode double-effect no root Template** — Em `/dashboard` → `/adaptar`, o novo root `Template` monta com `pathname="/adaptar"`. Strict Mode: effect cleanup (cancela t1/t2), depois re-monta o effect. Na segunda montagem, `genRef.current` foi incrementado para `1` na primeira montagem. Cleanup incrementou? Não — cleanup apenas cancela timers. Na segunda montagem, incrementa para `2`. O `myGen` é `2`. `t1` da primeira montagem (gen=1) já foi cancelado. Isso deveria ser OK.

**H7: Animação CSS simultânea** — O overlay `--exit` (180ms) e o conteúdo `--revealing` (340ms) correm ao mesmo tempo. Se a GPU/browser atrasar uma das animações, visualmente pode parecer que "abre 2 vezes". Pode ser um problema de performance visual, não de lógica React.

---

## O que ainda não foi investigado

1. **DevTools do navegador em produção** — Todos os testes foram em desenvolvimento (React Strict Mode ativo). O bug pode ser Strict Mode-específico.

2. **`console.log` de diagnóstico** — Nunca foi adicionado log para confirmar qual spinner está travando (root Template ou PlanosFocusRemount), qual event está disparando, e qual fase está sendo setada quando.

3. **Comportamento em build de produção** (`npm run build && npm start`) — Sem Strict Mode. Se o bug desaparece em produção, é Strict Mode. Se persiste, é timing real.

4. **Inspeção do DOM durante o travamento** — Não foi possível confirmar se o overlay preso é `z-index: 70` (root Template) ou outro, e qual React component root o renderiza.

---

## Recomendação de diagnóstico para o Opus

Antes de tentar mais fixes, adicionar logs temporários:

```tsx
// No início de cada setPhase call em template.tsx
console.log("[Template]", pathname, "setPhase →", newPhase, new Error().stack?.split("\n")[2]);

// No popstate handler
window.addEventListener("popstate", () => {
  console.log("[popstate] fired at", pathname, "lastBackForwardAt being set");
  ...
});

// No PlanosFocusRemount startTransition
const startTransition = () => {
  console.log("[PlanosFocusRemount] startTransition called", window.location.pathname);
  ...
};
```

Com esses logs, o fluxo exato de eventos e state transitions ficará visível no console do navegador durante a reprodução do bug.

---

## Contexto adicional

- Next.js App Router com `template.tsx` (não `layout.tsx`) — novo componente por navegação
- React 18 Concurrent Mode + React Strict Mode em desenvolvimento
- `phaseDoneCallbacks` é um `Set` module-level que nunca é limpo — entradas de instâncias desmontadas persistem (intencionalmente — React 18 ignora silenciosamente setState em componentes desmontados)
- `activeTransitionTimers` é um array module-level compartilhado entre instâncias — pode haver race condition se múltiplas instâncias de Template existirem simultâneamente (ex: durante a transição de rota, ambos o Template antigo e o novo podem estar vivos por um tick)
- O `/adaptar` tem **dois** Templates ativos durante a navegação: o root `apps/web/src/app/template.tsx` e `apps/web/src/app/adaptar/template.tsx`
