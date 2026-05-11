# Design: Aviso pre-redirecionamento no checkout Pro (contingencia Brick)

## Contexto e problema

O Payment Brick do Mercado Pago esta temporariamente bloqueado por elegibilidade/habilitacao no lado do provedor, e o time decidiu manter o checkout Pro como fluxo ativo ate o desbloqueio.

No estado atual, ao comprar um plano, o usuario pode nao entender claramente que:

- o pagamento acontece fora do EarlyCV (Mercado Pago)
- ele precisa voltar ao EarlyCV depois de pagar
- a efetivacao pode levar alguns minutos por confirmacao assincrona (webhook)

Essa lacuna aumenta abandono e gera duvida sobre o que fazer apos sair para o MP.

## Objetivo

Adicionar um passo de confirmacao antes de abrir o checkout Pro para orientar o usuario e reduzir confusao operacional durante a contingencia do Brick.

Fluxo desejado aprovado:

1. Usuario clica em comprar plano.
2. Exibir mensagem explicativa obrigatoria (modal/etapa de confirmacao).
3. Ao confirmar leitura, abrir Mercado Pago em nova aba.
4. Na aba atual do EarlyCV, redirecionar imediatamente para tela de aguardando efetivacao.

## Fora de escopo

- Reativar/ajustar Payment Brick.
- Mudar regras de aprovacao, creditos ou webhook.
- Reescrever o provedor de pagamentos.
- Alterar copy de outros fluxos de pagamento sem relacao com compra de plano.

## Abordagens consideradas

### 1) Redirecionar direto para MP (status quo)

**Pro:** zero desenvolvimento.
**Contra:** mantem a principal dor de entendimento do usuario.

### 2) Aviso inline simples na pagina de planos

**Pro:** implementacao rapida.
**Contra:** facil ignorar; nao garante confirmacao explicita antes da saida.

### 3) Confirmacao obrigatoria + abertura em nova aba + envio imediato para aguardando (recomendada)

**Pro:** guia o usuario no momento critico, reduz ambiguidade de proximo passo e melhora resiliencia do fluxo.
**Contra:** adiciona um clique antes do checkout.

Decisao: **abordagem 3**.

## Design tecnico

### 1) Etapa de confirmacao antes do checkout Pro

No acionamento de compra de plano, interceptar a navegacao direta para a URL do Mercado Pago e abrir uma confirmacao obrigatoria com:

- aviso de redirecionamento para o Mercado Pago
- instrucao de retorno ao EarlyCV apos pagamento
- expectativa de prazo de efetivacao (alguns minutos)

Somente apos confirmacao explicita, seguir para os proximos passos.

### 2) Abertura do MP em nova aba

Ao confirmar, abrir a URL de checkout Pro do Mercado Pago em nova aba/janela com foco no comportamento seguro para popup blockers (acao dentro do gesto do usuario).

Se a aba nao abrir (bloqueio do navegador), mostrar erro claro com CTA para tentar novamente.

### 3) Redirecionamento imediato da aba atual para aguardando

No mesmo fluxo de confirmacao, apos tentar abrir o MP, redirecionar imediatamente a aba atual para a rota de aguardando efetivacao associada a compra.

A tela de aguardando deve:

- reforcar que o pagamento deve ser concluido no MP
- informar que a efetivacao pode levar alguns minutos
- manter mecanismo atual de atualizacao de status (polling/webhook ja existente)
- oferecer acao de reabrir checkout quando aplicavel

### 4) Compatibilidade com contingencia do Brick

O fluxo Pro com aviso torna-se caminho padrao enquanto o Brick estiver desativado para uso real.

Nenhuma dependencia do Brick sera introduzida nesse fluxo.

## Fluxo de execucao esperado

1. Usuario inicia compra de plano no EarlyCV.
2. Sistema exibe confirmacao obrigatoria com orientacoes.
3. Usuario confirma leitura.
4. Sistema abre checkout Pro no MP em nova aba.
5. Sistema redireciona aba atual para pagina de aguardando efetivacao.
6. Usuario conclui pagamento no MP e retorna ao EarlyCV quando desejar.
7. EarlyCV atualiza estado via mecanismos atuais ate refletir aprovacao/pendencia/rejeicao.

## Estados de erro e tratamento

- **Popup bloqueado:** manter usuario no EarlyCV, mostrar orientacao para liberar popups e CTA de nova tentativa.
- **Falha ao obter URL de checkout:** exibir mensagem de erro e permitir retry sem perda de contexto.
- **Pagamento nao confirmado imediatamente:** manter comunicacao de processamento assincrono e atualizar status na tela de aguardando.

## Plano de testes

### Unitarios/UI

- clique em comprar abre confirmacao (nao abre MP direto)
- confirmar leitura dispara tentativa de `window.open` com URL do checkout
- apos confirmacao, rota atual vai para aguardando
- se `window.open` falhar, mensagem de erro/CTA aparecem

### Integracao

- fluxo completo de compra via Pro mantem criacao de preferencia e redirecionamento sem quebrar APIs existentes
- tela de aguardando continua recebendo/atualizando status da compra

### Verificacao manual

- iniciar compra de qualquer plano, confirmar visual do aviso e copy
- validar abertura do MP em nova aba
- validar redirecionamento imediato da aba atual para aguardando
- concluir pagamento e confirmar transicao de status conforme webhook/polling

## Riscos e mitigacoes

- **Risco:** usuario fechar a aba atual e ficar apenas no MP.
  - **Mitigacao:** copy no proprio MP/retorno e fallback de acesso posterior ao status no painel.
- **Risco:** bloqueio de popup em navegadores restritivos.
  - **Mitigacao:** abertura no contexto de clique + mensagem orientativa + botao de nova tentativa.
- **Risco:** copy longa reduzir conversao.
  - **Mitigacao:** texto objetivo em 2-3 blocos curtos com CTA claro.

## Rollout

- Deploy sem feature flag nova, aproveitando fluxo Pro existente.
- Monitorar eventos de clique/confirmacao/abertura e taxa de conclusao da compra.
- Manter como contingencia ate desbloqueio oficial do Brick pelo Mercado Pago.

## Criterios de aceite

- Ao clicar em comprar plano, usuario sempre visualiza e confirma aviso antes de sair para o MP.
- Confirmacao abre checkout Pro em nova aba e redireciona imediatamente a aba atual para aguardando efetivacao.
- Tela de aguardando comunica corretamente prazo e estado do processamento assincrono.
- Fluxo Pro permanece funcional sem dependencia do Brick.
