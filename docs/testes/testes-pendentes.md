Plano de validação manual antes de subir 0. Antes de testar

Rode:

git status --short
git diff --stat

Salve o output em algum lugar. Você precisa saber exatamente o que está indo, porque “subi umas coisas” é a frase que antecede muitos boletins de ocorrência técnicos.

Depois:

npm run test --workspace @earlycv/web
npm run build --workspace @earlycv/web
npm run build --workspace @earlycv/api

Se tiver tempo, rode também os principais focados:

npm run test --workspace @earlycv/api -- src/plans/plans.service.spec.ts src/payments/payments.service.spec.ts src/payments/payments.controller.spec.ts src/plans/plans-auto-unlock.e2e-spec.ts
npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.service.spec.ts src/common/cv-text-extractor.spec.ts
npm run test --workspace @earlycv/api -- src/payments/payment-audit-sanitization.spec.ts
npm run test --workspace @earlycv/ai -- src/pdf-parser.spec.ts
Checklist manual local

1. Cadastro/login

Validar:

curl -i -X POST http://localhost:3000/api/analysis-observability/business-funnel-events -H "content-type: application/json" -d "{}"

[X] criar usuário novo
[X] login com usuário existente
[X] logout
[X] tentar acessar /dashboard sem login
[X] tentar acessar /admin sem permissão
[X] tentar acessar /superadmin sem permissão

Testar no /adaptar:

[X] PDF válido pequeno
[X] DOCX válido pequeno
[X] ODT válido pequeno, se você tiver um fácil
[X] .doc antigo deve ser recusado
[X] arquivo inválido renomeado para .pdf deve ser recusado
[X] descrição de vaga curta demais deve ser recusada
[X] descrição de vaga válida deve analisar

Conferir:

[X] não quebra tela
[X] erro é amigável/controlado
[X] análise válida chega no teaser/resultado
[X] não chama IA quando arquivo é inválido 3. Fluxo de análise até resultado

Com usuário novo:

[X] enviar CV válido
[X] colar vaga válida
[X] gerar análise
[X] ver resultado teaser
[X] fazer cadastro/login se o fluxo pedir
[X] chegar no resultado completo
[X] CTA de liberar CV aparece corretamente

correções:

1. Quando o usuário seleciona keyword que não tem no seu cv, o score que está aparecendo no card de score na tela plano
   está mostrando valor sem considerar os pontos do keyword selecionado

2. Retirar o card de aviso de quantidade de candidados que já analisaram a vaga, vamos voltar isso quando o sistema
   tiver bastante volume de acesso de usuário, por enquanto pode deixar inativo.

3. Na rota adaptar, o sistema está fazendo o parse do documento depois validando a vaga, o sistema demora para dar erro
   quando a vaga é fora do que é esperado, o sistema deve primeiro fazer as checagens de cv quando é texto digitado, depois
   checagem da vaga, se passar ai sim fazer o parse do documento anexo,

Conferir no PostHog/local logs, se possível:

Pagamentos

[X] pagamento PIX pro
[X] pagamento PIX bricks

Duplicando eventos checar depois

[ ] analysis_started
[ ] cv_upload_completed
[ ] teaser_viewed/full_analysis_viewed
[ ] eventos sem CV bruto/job description completo 4. Compra de crédito

No modo atual, sem ativar Brick se o default ainda é Checkout Pro:

[ ] abrir página de planos
[ ] iniciar checkout do pacote menor
[ ] confirmar que redireciona/cria preferência Mercado Pago
[ ] pagamento aprovado gera crédito
[ ] pagamento pendente não gera crédito
[ ] retorno/callback sozinho não gera crédito sem backend aprovar

No banco, conferir a compra:

Erro ao gerar pix:

[ ] PlanPurchase status correto
[ ] creditsGranted correto
[ ] créditos do usuário aumentaram uma vez
[ ] PaymentAuditLog sem rawPayload bruto sensível 5. Liberar CV com crédito

Com usuário com crédito:

[ ] abrir adaptação bloqueada
[ ] clicar em liberar com crédito
[ ] crédito é debitado uma vez
[ ] CV fica unlocked
[ ] download PDF funciona
[ ] download DOCX funciona
[ ] repetir ação não debita de novo

Conferir:

[ ] cvUnlock criado/atualizado corretamente
[ ] isUnlocked ou estado equivalente correto
[ ] não cria unlock duplicado 6. Compra para liberar CV direto

Esse é crítico:

[ ] iniciar compra a partir do botão "Liberar CV"
[ ] pagar/aprovar
[ ] voltar para o sistema
[ ] adaptação correta é liberada
[ ] crédito não é duplicado indevidamente
[ ] download funciona

Conferir:

[ ] originAction = unlock_cv
[ ] originAdaptationId correto
[ ] autoUnlockProcessedAt preenchido, se aplicável
[ ] autoUnlockError vazio 7. Dashboard/resumes

Como mexeu em resumes.service.ts, valide também:

[ ] dashboard abre
[ ] lista de currículos aparece
[ ] currículo master aparece correto
[ ] editar título/nome de CV, se existir
[ ] definir CV principal, se existir
[ ] remover CV, se existir
[ ] histórico/download ainda funciona

Isso é importante porque esse arquivo apareceu como mudança fora do pacote principal. Não ignore. Ele pode estar certo, mas precisa passar pelo ritual básico antes de ir para produção, porque produção não aceita “mas parecia simples”.

1. SEO/site

Como existem mudanças SEO no branch:

[ ] landing abre
[ ] /blog abre
[ ] /curriculo-ats abre
[ ] /adaptar-curriculo-para-vaga abre
[ ] /palavras-chave-curriculo abre
[ ] sitemap gera sem admin/superadmin
[ ] páginas SEO não estão com noindex acidental

Rodar local:

curl -I http://localhost:3000/
curl -I http://localhost:3000/curriculo-ats
curl -I http://localhost:3000/admin
curl -I http://localhost:3000/superadmin
Critério de go/no-go
Pode subir se:
[ ] build web passou
[ ] build api passou
[ ] testes principais passaram
[ ] cadastro/login ok
[ ] upload/análise ok
[ ] PDF/DOCX ok
[ ] .doc bloqueado
[ ] compra de crédito ok
[ ] liberar CV com crédito ok
[ ] compra direta para liberar CV ok
[ ] dashboard/resumes ok
[ ] páginas SEO principais ok
[ ] /admin e /superadmin não vazam HTML interno
Não suba se:
[ ] compra aprovada não gera crédito
[ ] pagamento pendente gera crédito
[ ] liberar CV debita duas vezes
[ ] download quebra
[ ] upload válido quebra
[ ] .doc ou arquivo falso passa
[ ] /admin ou /superadmin mostra "Token ausente", "backoffice", "superadmin" ou "HttpOnly"
[ ] dashboard quebra
[ ] build falha
Deploy

Se passar tudo, suba. Mas suba consciente de que é um lote grande.

Depois do deploy, rode imediatamente:

curl -I -L https://earlycv.com.br/admin
curl -I -L https://earlycv.com.br/superadmin

curl -s -L https://earlycv.com.br/admin | grep -Ei "token|backoffice|superadmin|admin / acesso|HttpOnly" || echo "OK"
curl -s -L https://earlycv.com.br/superadmin | grep -Ei "token|backoffice|superadmin|admin / acesso|HttpOnly" || echo "OK"

Headers:

curl -I https://earlycv.com.br/
curl -I https://earlycv.com.br/adaptar
curl -I https://earlycv.com.br/pagamento/concluido

Conferir:

[ ] Strict-Transport-Security
[ ] X-Content-Type-Options
[ ] Referrer-Policy
[ ] Permissions-Policy
[ ] X-Frame-Options
[ ] Content-Security-Policy-Report-Only
[ ] X-Robots-Tag só em admin/superadmin
Pós-deploy manual obrigatório

Faça em produção com um usuário seu:

[ ] criar usuário
[ ] upload PDF ou DOCX real
[ ] gerar análise
[ ] comprar menor pacote
[ ] confirmar crédito
[ ] liberar CV
[ ] baixar PDF/DOCX
[ ] verificar logs Railway
[ ] verificar eventos PostHog principais
[ ] verificar PaymentAuditLog sem payload bruto
Regra de rollback

Se quebrar pagamento, upload ou download:

rollback imediato
não tentar corrigir em produção
não "só mais um ajuste rápido"

Porque “só mais um ajuste rápido” é como produção invoca demônios.
