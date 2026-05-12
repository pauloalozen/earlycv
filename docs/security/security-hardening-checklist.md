# Security hardening - EarlyCV

Data: 2026-05-11

## P0

- [x] SPF/DKIM/DMARC validados (Validar por alguns dias, depois mudar para reject)
- [ ] IDOR testado em endpoints críticos
- [ ] Pagamento não libera crédito/plano sem confirmação backend
- [ ] Replay de webhook não duplica crédito
- [ ] Usuário A não acessa recurso do usuário B

## P1

- [ ] Upload PDF com limites
- [ ] Rate limit/cota de IA
- [ ] Admin protegido server-side
- [ ] CSP bloqueante mínima
- [ ] Headers de segurança

## Evidências

Adicionar prints, comandos, logs e testes.

curl -X POST 'https://api.resend.com/emails' \
 -H 'Authorization: re_E4kMsz8v_D9y8i2MGDe8gNW68rGqpo1Lh' \
 -H 'Content-Type: application/json' \
 -d '{
"from": "EarlyCV <contato@earlycv.com.br>",
"to": ["paulo.alozen@gmail.com"],
"subject": "Teste autenticação EarlyCV",
"html": "<p>Teste de autenticação SPF DKIM DMARC.</p>"
}'
