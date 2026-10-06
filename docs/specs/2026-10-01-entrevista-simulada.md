# Entrevista Simulada (Ensaio Geral) — venda avulsa

Branch: `feature/simulado-entrevista` (a partir de `develop`). Status: implementado e testado localmente, **não publicado**.

## O produto

- Sessão ao vivo de 45 min com o Paulo, pelo Google Meet, com feedback na hora e **relatório formal** depois.
- Venda avulsa, sem limite de compras por usuário. **Preço via `PRICE_INTERVIEW_SIM` (centavos; hoje 7990 = R$ 79,90)**, "oferta de lançamento" (sem preço riscado). A API é a fonte única: cobra esse valor e o expõe em `GET /api/mock-interviews/offer`; o web lê de lá (cache de 5 min). Sem a variável (ou inválida) a venda fecha: checkout recusa, o preço some das páginas e a oferta por e-mail não é enfileirada.
- Exige login. Pagou → a página do pedido libera o botão do WhatsApp do Paulo (número nunca exposto antes do pagamento). Agenda combinada à mão; o Paulo registra no admin.
- Política (aceite obrigatório no checkout, versão `2026-10-01`): reembolso integral até 24h antes do horário agendado (ou a qualquer momento antes de agendar); remarcação com 24h de antecedência; no-show perde o valor.
- Nome: o serviço é apresentado como "Entrevista simulada"; "Ensaio Geral" é marca secundária.

## Onde vende

| Ponto | Rota / arquivo |
|---|---|
| Landing própria (SEO: Service+Offer+FAQPage, sitemap) | `/simulacao-de-entrevista` — `apps/web/src/app/simulacao-de-entrevista/page.tsx` |
| Aba na vitrine da landing principal + menu Produtos + rodapé | `_landing/_feature-showcase.tsx`, `_landing/_shared.tsx` (FEATURE_PAGES), `components/public-footer.tsx` |
| Link a partir do roteiro grátis | `/preparacao-para-entrevista` (CTA final) |
| Card no detalhe da candidatura em "Entrevista" + modal após registrar a entrevista (1x por candidatura) | `app/candidaturas/[id]/mock-interview-offer.tsx` |
| E-mail de oferta 2h depois da candidatura ir para INTERVIEW | `EmailDispatch` kind `MOCK_INTERVIEW_OFFER` |

A origem da venda fica gravada na compra (`landing`, `showcase` via `?origem=vitrine`, `application_offer`, `offer_email` via `?origem=email`).

## Arquitetura

- **Separado de `PlanPurchase` de propósito**: a aprovação de `PlanPurchase` sobrescreve `User.planType` e concede créditos. Nada do fluxo de créditos foi alterado.
- Tabelas novas: `MockInterviewPurchase` (pagamento + operação da sessão) e `MockInterviewEvent` (histórico). Migration `20261002120000_mock_interview` (só aditiva; também adiciona o kind/template `MOCK_INTERVIEW_OFFER` e a coluna `EmailDispatchSettings.mockInterviewOfferMode`).
- API: `apps/api/src/mock-interviews/`.
  - **Mesmo checkout dos planos: Payment Brick**, o pagamento acontece dentro do EarlyCV (cartão ou Pix), sem redirecionar para o Mercado Pago. Mesmas credenciais do Brick (`MERCADOPAGO_BRICK_ACCESS_TOKEN*` / `NEXT_PUBLIC_MERCADOPAGO_BRICK_PUBLIC_KEY`), `external_reference = mock_interview:{id}` e **webhook próprio** `POST /api/mock-interviews/webhook/mercadopago` (vai no `notification_url` do pagamento). Assinatura conferida com os mesmos segredos do fluxo de créditos.
  - Endpoints do Brick: `GET /api/mock-interviews/purchases/:id/brick` (dados do pedido) e `POST /api/mock-interviews/purchases/:id/brick/pay` (cria o pagamento com o valor do PEDIDO, trava atômica `processing_payment`, idempotency key por tentativa). Cartão aprovado na hora → pago; recusado → pedido volta a `pending` para nova tentativa; Pix/análise → `pending_payment` com QR code até o webhook; erro ambíguo do provider → `pending_payment` (reconciliação resolve). Com Pix em aberto, uma segunda tentativa é barrada (nunca dois pagamentos), e a recusa atrasada de uma tentativa anterior não derruba o Pix atual.
  - Helpers do Brick no web (`lib/mercadopago-brick.ts`) passaram a ser compartilhados com o checkout dos planos (só extraídos, sem mudança de comportamento).
  - Toda transição de pagamento é `updateMany` condicional ao status atual (dois webhooks concorrentes aprovam uma vez só). Valor e moeda pagos são conferidos contra o pedido. `refunded`/`charged_back` → `refunded` (e sessão aberta → `REFUNDED`). Recusado → `failed`, e um pagamento aprovado depois no mesmo pedido ainda aprova.
  - A página do pedido reconcilia direto no MP (`?refresh=true`) se o webhook atrasar.
  - Trilha em `PaymentAuditLog` com `internalCheckoutType = "mock_interview"`.
  - E-mails transacionais (categoria BILLING, Resend em produção, fake fora dela), **independentes dos modos do dispatch**: aviso de venda para `MOCK_INTERVIEW_ADMIN_EMAIL` e confirmação para o comprador. Claim atômico + Idempotency-Key; cron a cada 5 min reenvia o que falhou (até 3 dias).
  - Admin: `GET/PATCH /api/admin/mock-interviews` (admin/superadmin). Estorno nunca é manual: é feito no painel do MP e o webhook marca.
- Oferta por e-mail (relacionamento/SES, com descadastro): enfileirada por `JobApplicationsService` ao mudar para INTERVIEW (status ou agendamento). Regras: 2h de atraso; no máximo 1 a cada 7 dias por usuário; no envio é pulada se comprou depois da oferta, se a candidatura foi apagada ou pelas regras de relacionamento (verificado, não staff, não descadastrado, sem supressão, fora da blocklist). **Não** aplica o cutoff por data de cadastro (vale para a base inteira); o cutoff é o da própria oferta.

## Feature flag (MOCK_INTERVIEW_MODE)

Três estados: `off` (padrão; ausente ou inválido = off), `admin` (só staff admin/superadmin) e `on` (todos). Duas variáveis com o mesmo valor: `MOCK_INTERVIEW_MODE` na API (gate real) e `NEXT_PUBLIC_MOCK_INTERVIEW_MODE` no web (exibição; mudar exige novo deploy do web).

| | off | admin | on |
|---|---|---|---|
| API: oferta, checkout, dados do Brick, pagamento | 404 | só staff | todos |
| Landing `/simulacao-de-entrevista` e `/comprar` | 404 | só staff logado (noindex, dinâmica) | todos (estática/ISR) |
| `/pagamento/[id]` | redireciona ao pedido | só staff | todos |
| Vitrine da landing, menus, rodapé, sitemap, link em /preparacao-para-entrevista | some | some | aparece |
| Oferta na candidatura em INTERVIEW (card + modal) | some* | só staff | todos |
| E-mail de oferta (enfileirar e enviar) | não | não | sim (+ modo do dispatch) |
| Pedido do usuário, /compras, webhook, e-mails de venda, admin | sempre | sempre | sempre |

\* Uma sessão já paga e não realizada continua aparecendo no card da candidatura. Com a venda fechada, a página do pedido esconde os atalhos para comprar de novo. O admin (`/admin/simulados`) mostra o modo da API e do web e acusa divergência. Um e-mail de oferta enfileirado é descartado no envio (`mock_interview_disabled`) se a flag sair de `on`.

## Telas

- `/simulacao-de-entrevista/comprar` — resumo, regras com checkbox obrigatório; cria o pedido e segue para o pagamento. Sem login → cadastro com `next` de volta.
- `/simulacao-de-entrevista/pagamento/[id]` — checkout Brick no mesmo layout do checkout dos planos (resumo à esquerda, cartão/Pix à direita, QR code do Pix, acompanhamento automático até a confirmação). Pedido já pago/em andamento vai direto para a página do pedido.
- `/simulacao-de-entrevista/pedido/[id]` — retorno do MP; consulta sozinha enquanto pendente; pago → botão do WhatsApp com mensagem pronta e código do pedido; agendado → data/hora e link do Meet.
- `/compras` — seção "Entrevistas simuladas".
- Admin → **Entrevistas simuladas** (`/admin/simulados`): resumo (aguardando agenda, agendadas, realizadas, receita), filtros, paginação no banco; detalhe com agenda, link do Meet, status (Aguardando agenda / Agendada / Realizada / Não compareceu / Cancelada), relatório enviado, anotações, direito a reembolso calculado e histórico.
- Admin → Emails → Configurações: novo modo "Oferta da entrevista simulada" (OFF por padrão). Template editável em Emails → Templates.

## Ativação (produção)

0. Flag: começar com `MOCK_INTERVIEW_MODE=admin` (Railway) e `NEXT_PUBLIC_MOCK_INTERVIEW_MODE=admin` (Vercel) para testar em produção; depois `on` nas duas.
1. Variáveis na API (Railway): `PRICE_INTERVIEW_SIM=7990`, `MOCK_INTERVIEW_WHATSAPP_NUMBER` (com DDI+DDD) e `MOCK_INTERVIEW_ADMIN_EMAIL=paulo.alozen@gmail.com`. Mudar o preço = mudar a variável e reiniciar a API; pedidos já criados mantêm o valor gravado. Sem o número, a página do pedido avisa que o contato será por e-mail.
2. Deploy aplica a migration (`.railway-redeploy` já tocado).
3. E-mail de oferta: Admin → Emails → Configurações → modo da oferta (SHADOW/ALLOWLIST antes de LIVE). Atenção: as contas do Paulo estão na blocklist fixa de relacionamento, então ele nunca recebe a oferta.
4. Teste real: uma compra de R$ 79,90 em produção e estorno pelo painel do MP, conferindo webhook, e-mails e a mudança para "Estornado" no admin.

## Pendências

- Foto do Paulo e bio detalhada (cargos, empresas, nº de entrevistas) na landing — hoje a bio usa só fatos confirmados.
- Prazo de entrega do relatório (a página diz só "depois da sessão").
- Termos de Uso ainda não citam a política da entrevista simulada (ela aparece na landing, no checkout com aceite e no e-mail).
- Fora do escopo desta entrega: agendamento automático, botão de estorno no admin, cupons/afiliados para este produto.
