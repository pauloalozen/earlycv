Checklist para validação em produção

- [ ] Analisar vaga → CV adaptado aparece linkado em "Minhas Candidaturas" (fluxo A)
- [ ] Dashboard → clicar "Ver candidatura" navega para detalhe correto
- [ ] Detalhe da candidatura → atualizar status, salvar nota, abrir drawer de interview prep
- [ ] Resultado page → bloco "Acompanhe essa oportunidade" aparece apenas para usuário autenticado com jobApplicationId
- [ ] Usuário sem candidatura vinculada → NÃO vê chip "Ver candidatura" no dashboard
- [ ] Candidatura criada manualmente → aparece na lista, sem CV vinculado

  Checklist pós-deploy
  - [ ] Verificar Railway logs: migration 20260525172014_add_job_applications rodou sem erro
  - [ ] Verificar Railway logs: API subiu sem erro de schema/relação
  - [ ] Acessar /dashboard/candidaturas — lista vazia para usuário existente (esperado)
  - [ ] Fazer uma análise de vaga com usuário autenticado → candidatura aparece na lista
  - [ ] Confirmar que currentCvAdaptationId está vinculado na candidatura criada
  - [ ] Abrir detalhe da candidatura → atualizar status → adicionar nota
  - [ ] Clicar "Preparar entrevista" → confirmar que IA é chamada e resultado é exibido
  - [ ] Recarregar página do detalhe → prep aparece sem chamar IA novamente
  - [ ] Testar criação manual com cargo+empresa apenas
  - [ ] Dashboard → chip "Ver candidatura" aparece nas adaptações com vínculo
  - [ ] Resultado page → bloco "Acompanhe essa oportunidade" aparece para adaptação vinculada

Checklist pós-deploy, na ordem
Acessar /dashboard/candidaturas.
Ver estado vazio com usuário antigo.
Criar candidatura manual só com cargo + empresa.
Abrir detalhe.
Atualizar status.
Adicionar nota.
Criar candidatura manual com URL e conferir “Abrir vaga”.
Fazer uma análise real logado.
Confirmar que a candidatura foi criada automaticamente.
Confirmar chip “Ver candidatura” no dashboard/histórico.
Confirmar bloco “Acompanhe essa oportunidade” no resultado.
Gerar/baixar CV e garantir que download continua normal.
Mudar status para INTERVIEW.
Gerar preparação para entrevista.
Recarregar página e confirmar que a prep persistida aparece sem nova chamada de IA.
