Testes Pagamentos:
[ ] Plano pago libera crédito
[ ] CV adaptado pago libera download/crédito
[ ] Webhook duplicado não duplica nada
[ ] Redirect success sem webhook não libera crédito
[ ] Reconciliação aprova pendentes reais
[ ] Logs permitem rastrear por checkoutId, paymentId e preferenceId
[ ] Usuário nunca fica preso na tela do Mercado Pago

Testes Arquivos de CV e Descrição de vagas:
[ ] PDF com senha mostra mensagem amigável
[ ] PDF escaneado mostra mensagem específica
[X] PDF que não é CV é barrado antes da IA
[ ] CV em inglês não é barrado
[X] Descrição de vaga inválida é barrada antes da IA
[ ] Erros técnicos ficam só no log interno

1. PDF com senha
2. PDF escaneado
3. CV em PT-BR
4. CV em inglês
5. Descrição de vaga válida PT-BR
6. Descrição de vaga válida EN

TASK A FAZER - ORDEM DE PRIORIDADE.

1. Pagamento ńão está liberando credito. (ok)
2. Criar uma sessao de pedidos do usuario para ele ver o que comprou. (ok)
3. Ajustar card da tela adaptar 60s e e2e
4. Diminuir o numero de linhas exibidas no preview do cv.
5. todo lugar que tiver logo do earlycv redirecionar para landingpage
6. Criar uma açao que o usuario exclua sua conta.
7. Usuario sendo deslogado com muita rapidez, qnto tempo fica logado?

Mobile:

1. ajustar no historico posicao do score index
