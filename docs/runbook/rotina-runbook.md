🧭 RUNBOOK OPERACIONAL — EARLYCV (PROTEÇÃO + FUNIL)
🎯 Objetivo

Garantir diariamente que:

você não está perdendo dinheiro com IA
você não está bloqueando usuário bom
você entende onde o usuário está abandonando
o sistema não está se degradando silenciosamente
📅 ROTINA DIÁRIA (15–20 min)
🔹 1. Checagem rápida de saúde (manhã)
Perguntas que você responde:
o sistema está funcionando?
a IA está respondendo?
algo quebrou durante a noite?
Olhar:
openai_request_started
openai_request_success
openai_request_failed
Sinais de alerta:
falhas subiram de repente
sucesso caiu muito
latência absurda

👉 Se sim: problema técnico ou provider

🔹 2. Checagem de proteção (anti-bot)
Olhar:
turnstile_invalid
rate_limit_block_initial
rate_limit_block_contextual
duplicate_request_blocked
daily_limit_block
abuse_detected
Interpretação:
Situação Significado
quase nenhum bloqueio proteção fraca
bloqueio moderado saudável
bloqueio muito alto risco de falso positivo

👉 Aqui você descobre se está sendo atacado ou só configurou mal

🔹 3. Checagem de custo indireto
Olhar:
quantidade de openai_request_started
quantidade de cache_hit
Interpretação:
poucos cache hits → você está gastando mais do que precisa
muitos requests sem crescimento de usuários → suspeito
🔹 4. Checagem do funil (rápido)
Olhar principais quedas:
landing_view → landing_cta_click
adapt_page_view → analyze_submit_clicked
analysis_started → teaser_viewed
teaser_viewed → signup_started
checkout_started → purchase_completed
Pergunta simples:

👉 “onde está morrendo mais gente hoje?”

🔹 5. Checar purge
rodou?
removeu dados?
não está acumulando infinito?
🔹 6. Checar alterações de config
alguém mexeu?
o que mudou?
houve impacto depois disso?
📅 ROTINA SEMANAL (45–60 min)
🔹 1. Ajuste fino de proteção
revisar limites:
rate limit
cooldown
dedupe

👉 basear em comportamento real, não em feeling

🔹 2. Evolução do rollout

Se ainda estiver em observe-only:

já tem confiança?
houve falso positivo?

👉 decidir:

continuar observando
ir para soft-block
🔹 3. Revisão do funil completo

Perguntas:

onde está o maior drop-off?
isso é UX ou preço?
isso é bug ou comportamento esperado?
🔹 4. Custo vs uso
crescimento de uso acompanha chamadas de IA?
tem desperdício?
🔹 5. Saúde dos dados
eventos estão duplicando?
eventos estão faltando?
correlação (requestId, sessionId) está consistente?
📅 ROTINA MENSAL (1–2h)
🔹 1. Revisão de configuração completa
thresholds ainda fazem sentido?
limites estão muito folgados?
limites estão muito agressivos?
🔹 2. Revisão de retenção
TTL adequado?
custo de storage ok?
precisa ajustar purge?
🔹 3. Revisão de eventos
eventos inúteis?
eventos faltando?
naming consistente?
🔹 4. Preparação para evolução

Aqui entra:

PostHog
dashboards
experimentos
🚨 PLAYBOOK DE INCIDENTE (quando algo dá errado)
🧨 Caso 1 — Usuário não consegue analisar

Sintoma:

queda em analysis_started
aumento de bloqueios

Ação:

verificar turnstile_invalid
verificar rate limit
mudar temporariamente:
rollout_mode = observe-only
💸 Caso 2 — custo disparando

Sintoma:

muitos openai_request_started
pouco bloqueio

Ação:

verificar dedupe
verificar rate limit
ativar:
soft-block ou hard-block
revisar thresholds
🤖 Caso 3 — ataque/bot

Sintoma:

pico em:
rate*limit_block*\*
abuse_detected

Ação:

aumentar rate limit raw
ativar auth_emergency_enabled
eventualmente kill_switch (último recurso)
💀 Caso 4 — tudo quebrado

Ação direta:

kill_switch_enabled = true

👉 para tudo
👉 respira
👉 investiga

🧠 REGRAS DE OURO

1. Nunca mude várias configs ao mesmo tempo

Senão você não sabe o que causou o efeito.

2. Sempre observe antes de bloquear

Por isso existe observe-only.

3. Proteção é ajuste fino contínuo

Não existe configuração perfeita inicial.

4. Evento ruim = decisão ruim

Se o dado está errado, seu insight é inútil.

5. Se não está olhando, está quebrando

Sistema sem monitoramento = problema adiado

📊 O que você deve conseguir responder TODO DIA

Se não consegue responder isso, ainda falta maturidade:

Quantas análises foram feitas hoje?
Quantas falharam?
Quantas foram bloqueadas?
Onde os usuários estão abandonando?
Estou gastando mais ou menos do que ontem?
Alguma config mudou e impactou?
🧭 Próximo nível (quando quiser evoluir)

Depois que isso estiver rodando liso:

conectar PostHog
criar dashboards
criar alertas automáticos
criar experimentos A/B
🧾 TL;DR brutal

Todo dia:

ver erro
ver bloqueio
ver funil
ver custo

Toda semana:

ajustar limites
revisar conversão

Se algo der errado:

reduz proteção ou ativa kill switch
