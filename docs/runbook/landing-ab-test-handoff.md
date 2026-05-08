# Landing A/B Test Handoff

Data: 2026-05-07

## Objetivo

Preparar teste A/B da landing principal (`/`) com controle por variavel de ambiente, preservando uma copia congelada da versao atual (A) e permitindo implementar/iterar a versao B.

## Decisoes aprovadas

- Controle por env: `NEXT_PUBLIC_LANDING_VARIANT`
- Valores aceitos: `A` e `B`
- Fallback obrigatorio: qualquer valor ausente/invalido deve cair em `A`
- Preservacao da atual: copiar landing atual para `apps/web/src/app/_landing/variant-a.tsx` sem alterar comportamento

## Estado atual no codigo

- Seletor de variante em `apps/web/src/app/page.tsx`
  - Usa `resolveLandingVariant(process.env.NEXT_PUBLIC_LANDING_VARIANT)`
  - Renderiza `LandingVariantA` para `A`/fallback
  - Renderiza `LandingVariantB` para `B`
- Resolver da regra de fallback em `apps/web/src/app/_landing/variant.ts`
- Teste unitario da regra em `apps/web/src/app/_landing/variant.test.ts`
- Versao A preservada em `apps/web/src/app/_landing/variant-a.tsx`
- Versao B inicial em `apps/web/src/app/_landing/variant-b.tsx` (pode ser substituida pelo Claude)

## Correcao ja aplicada

- Erro SSR `siteConfig is not defined` foi corrigido em `apps/web/src/app/_landing/variant-a.tsx` com:
  - `import { siteConfig } from "@/lib/site";`

## Instrucoes para o Claude implementar a pagina B

1. Nao mexer no conteudo/comportamento de `variant-a.tsx`.
2. Implementar B em `variant-b.tsx` copiando somente estrutura/secoes/copy da referencia visual, mantendo identidade visual ativa do produto (monocromatica escura-sobre-clara; sem laranja).
3. Manter `page.tsx` como orquestrador de variante por env.
4. Nao quebrar metadata SEO publica de `/`.
5. Manter fallback para `A` como comportamento padrao de seguranca.

## Comando util

```bash
NEXT_PUBLIC_LANDING_VARIANT=B npm run dev --workspace @earlycv/web
```

## Criterio de aceite rapido

- Com `NEXT_PUBLIC_LANDING_VARIANT=A` ou sem env: landing A abre normalmente.
- Com `NEXT_PUBLIC_LANDING_VARIANT=B`: landing B abre normalmente.
- Sem erro SSR no console do servidor.
