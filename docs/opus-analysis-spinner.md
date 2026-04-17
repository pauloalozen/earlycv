Diagnóstico arquitetural (não é só timing):

O bug não é um timer errado. É o acúmulo de estado global compartilhado entre 3 sistemas de
spinner independentes, cada um reagindo a eventos de navegação de forma diferente, em cima  
 do duplo-mount do Strict Mode e do ciclo mount/unmount de template.tsx. Cada tentativa  
 adicionou mais guards e mais estado module-level, aumentando a superfície do problema.

Pontos concretos que ainda estão errados no código:

1. phaseDoneCallbacks nunca é limpo — em Strict Mode, cada mount adiciona uma entrada.  
   setPhase em componentes desmontados é no-op, mas o Set cresce indefinidamente e dispara N
   closures a cada popstate/pageshow.
1. activeTransitionTimers é module-level compartilhado — se duas instâncias de Template
   existem simultaneamente (transição de rota + Strict Mode), uma sobrescreve os timers da  
   outra. O cancelamento no popstate pode cancelar timers da instância errada.
1. PlanosFocusRemount duplica toda a lógica do root Template — sem compartilhar  
   lastBackForwardAt nem phaseDoneCallbacks. É um segundo sistema de transição rodando em  
   paralelo no /planos.
1. Bug 2 provavelmente não é o Template — /adaptar/resultado/page.tsx tem próprio overlay  
   fixed inset-0 z-50 quando !data. O "abre 2 vezes" pode ser o overlay do Template terminando
   e o próprio spinner da página aparecendo em seguida.

Minha recomendação honesta:

Depois de 2 dias, o caminho de menor risco é remover o sistema de transição inteiro —  
 template.tsx do root vira passthrough, PlanosFocusRemount é deletado. Next.js em SPA já
transiciona de rota instantaneamente; o overlay existe só para mascarar latência de  
 componentes que deveriam ter seus próprios loading.tsx ou Suspense.

Três opções concretas que posso executar agora:

- A) Remover completamente o overlay global (root template.tsx → passthrough, deletar  
  PlanosFocusRemount, converter spinners específicos em loading.tsx de cada rota que realmente
  precisa).
- B) Manter o overlay mas reescrever com UMA só fonte de verdade: sem module-level state,
  sem phaseDoneCallbacks, sem activeTransitionTimers. Só useState + useEffect([pathname]) com
  cleanup. Aceitar que back/forward mostra 180ms de spinner (trade-off).
- C) Adicionar os logs de diagnóstico do documento e reproduzir no navegador antes de tocar
  no código, pra confirmar qual spinner trava.

Qual você quer?

✻ Sautéed for 2m 16s

❯ o comportamento que quero, spinner para travar a tela e somente exibir após conclusão de  
 montagem da tela para não ficar piscando na frente do usuário, e animação de entrada da  
 tela, percebi que tem varias camadas fazendo animacoes o que está fazendo piscar em algum  
 momento, entendo que a opcão A seria a mais indicada, qual vc indica para ter esse  
 comportamento que descrevi?

● Recomendo Opção A simplificada, com arquitetura mínima. Comportamento que descreveu precisa
de UMA camada só de transição.

Proposta:

1. Root template.tsx reescrito — uma state boolean (visible), overlay some quando true,  
   conteúdo faz fade-in. Sem popstate, sem bfcache, sem pageshow, sem module-level state, sem  
   genRef, sem 3 fases:  


"use client";
import { useEffect, useState } from "react";

export default function Template({ children }: { children: React.ReactNode }) {  
 const [visible, setVisible] = useState(false);
useEffect(() => {  
 const t = setTimeout(() => setVisible(true), 200);  
 return () => clearTimeout(t);  
 }, []);
return (  
 <>  
 {!visible && (
<div className="route-transition-overlay" role="status" aria-live="polite">
<div className="route-transition-spinner" aria-hidden="true" />  
 </div>
)}  
 <div className={visible ? "route-content route-content--visible" : "route-content"}>
{children}  
 </div>
</>  
 );  
 }

Template remonta a cada navegação (incluindo Back), então cada rota sempre começa escondida
atrás do spinner e faz fade-in.

2. Deletar PlanosFocusRemount inteiro — era um segundo sistema de spinner paralelo que nunca
   deveria ter existido.
3. Deletar apps/web/src/app/adaptar/template.tsx — só existia para compensar arquitetura  
   anterior.
4. Investigar e remover spinners fullscreen duplicados nas páginas — PageShell e
   /adaptar/resultado/page.tsx têm overlays fixed inset-0 próprios que ficam empilhados com o  
   overlay de transição. Essa é a causa do "abre 2 vezes": overlay do Template fade out (200ms)
   → overlay da página ainda visível → troca visível. Preciso mapear onde estão e decidir caso
   a caso.
5. CSS colapsado para uma única animação de conteúdo (opacity + translateY), sem keyframes
   separados para overlay.

Tradeoff: com essa abordagem, Back/Forward também mostram spinner por 200ms. É consistente e
previsível — o bug atual tentava pular spinner em back/forward, e toda a complexidade
nasceu disso. Aceitar o spinner em todas as navegações elimina a classe inteira de bugs.

Plano de execução sugerido (em ordem):

1. Fazer snapshot (git status limpo, já está)
2. Reescrever template.tsx
3. Deletar PlanosFocusRemount e atualizar planos/page.tsx para usar children direto
4. Deletar adaptar/template.tsx
5. Auditar PageShell e /adaptar/resultado/page.tsx — remover overlays fullscreen que  
   duplicam o do template
6. Atualizar/remover testes em planos-navigation.spec.ts e route-transition-template.spec.ts
   que testam o sistema antigo
7. Rodar check, build, test
8. Você testa no navegador  


Quer que eu comece pela reescrita + deleções (passos 2–4) e pare pra você revisar antes de  
 auditar os spinners de página?
