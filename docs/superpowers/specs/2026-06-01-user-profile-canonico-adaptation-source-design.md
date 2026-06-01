# Design: UserProfile canônico com fontes de adaptação explícitas

## Contexto

Hoje o EarlyCV mistura informações do candidato entre `Resume.rawText`, JSONs de adaptação e campos pontuais de perfil.
Isso dificulta edição, rastreabilidade, merge e consistência entre análise e geração final do CV.

Também existe ambiguidade entre:

1. de onde veio a entrada da análise (arquivo, texto colado ou perfil), e
2. qual fonte foi tratada como base principal para análise/geração.

Precisamos organizar esse modelo sem quebrar o fluxo principal e sem transformar a experiência em formulário longo obrigatório.

---

## Objetivo

Evoluir `UserProfile` para ser o perfil canônico estruturado e editável do candidato, mantendo UX leve e fluxo principal desbloqueado.

O sistema deve suportar dois modos explícitos de adaptação:

1. adaptar a partir de conteúdo enviado agora;
2. adaptar a partir do perfil salvo.

E deve manter um fluxo separado de atualização de CV Base para enriquecer o perfil canônico com merge inteligente.

---

## Fora de escopo (Fase 1)

1. Backfill massivo de toda base histórica.
2. Normalização relacional completa de experiências/formação/habilidades em novas tabelas.
3. Tela obrigatória de revisão completa com dezenas de campos antes da geração.
4. Alterações visuais amplas fora das telas diretamente impactadas (`/adaptar`, resultado e `/cv-base`).

---

## Decisões de modelagem

### 1) Separar `adaptationSource` de `inputMode`

`adaptationSource` representa a base principal lógica da adaptação.

- `uploaded_content`
- `user_profile`

`inputMode` representa como o usuário alimentou a análise.

- `file_upload`
- `text_paste`
- `profile`

Regra:

1. `inputMode=file_upload` ou `text_paste` implica `adaptationSource=uploaded_content`.
2. `inputMode=profile` implica `adaptationSource=user_profile`.

### 2) UserProfile canônico no modelo existente

Não criar tabela paralela para perfil canônico nesta fase.

Expandir `UserProfile` para suportar:

1. dados pessoais estruturados;
2. blocos curriculares em JSON;
3. metadados granulares de origem/edição;
4. sugestões/conflitos persistidos.

### 3) JSON para blocos curriculares (speed-first)

Nesta fase, usar colunas `Json` no `UserProfile` para:

1. `experiencesJson`
2. `educationJson`
3. `skillsJson`
4. `languagesJson`
5. `certificationsJson`

### 4) Metadados granulares por campo (`fieldPath`)

Não usar apenas flag por bloco inteiro.

Persistir metadados por caminho lógico de campo, por exemplo:

- `phone`
- `linkedinUrl`
- `experiences.exp_123.role`
- `education.edu_456.institution`

Regra obrigatória: não usar índice de array no caminho persistido.
Cada item de arrays curriculares deve ter `id` estável.

Estrutura mínima por item:

1. `experiencesJson[*].id`
2. `educationJson[*].id`
3. `languagesJson[*].id`
4. `certificationsJson[*].id`

Metadados por campo:

1. `source`: `analysis_upload` | `base_cv_upload` | `manual_edit`
2. `confidence`: número opcional (`0..1`)
3. `manuallyEdited`: boolean
4. `lastExtractedAt`
5. `lastEditedAt`
6. `sourceCvId` (quando aplicável)

Sugestão técnica: `profileFieldMetaJson: Json` com mapa `fieldPath -> metadata`.

### 5) Persistir conflitos/sugestões

Conflitos não podem existir só em resposta temporária de API.

Persistir em `UserProfile` via JSON com status:

- `pending`
- `accepted`
- `rejected`

Sugestão técnica: `profileSuggestionsJson: Json`.

### 6) Readiness do perfil

Adicionar status derivado/persistido para habilitar UX de “usar perfil salvo” com segurança:

- `empty`
- `partial`
- `ready`

Sugestão técnica: campo `profileReadinessStatus` no `UserProfile`, recalculado em cada merge/edição.

Definição objetiva na Fase 1:

1. `empty`: sem dados curriculares úteis.
2. `partial`: possui alguns dados, mas insuficientes para gerar CV completo com segurança via perfil salvo.
3. `ready`: possui dados mínimos para adaptação usando perfil salvo.

Critério mínimo de `ready` (Fase 1):

1. pelo menos 1 experiência em `experiencesJson`;
2. e pelo menos 1 bloco de habilidades não vazio em `skillsJson` (`technical`, `business` ou `soft`);
3. e pelo menos um dado de identificação/apresentação (`fullName` ou `headline` ou `professionalSummary`).

Regra de UX na Fase 1: habilitar “usar perfil salvo” apenas quando `profileReadinessStatus=ready`.

---

## Escopo funcional do UserProfile canônico

### Dados pessoais

1. `fullName`
2. `email` (fonte principal em `User.email`; perfil usa referência/espelho de leitura)
3. `phone`
4. `linkedinUrl`
5. `city`
6. `state`
7. `country`

### Resumo

1. `headline`
2. `professionalSummary`

### Blocos JSON

1. `experiencesJson`
2. `educationJson`
3. `skillsJson` (`technical`, `business`, `soft`)
4. `languagesJson` (opcional)
5. `certificationsJson` (opcional)

---

## Snapshots obrigatórios em `CvAdaptation`

Cada adaptação deve guardar o que foi efetivamente usado, para histórico e auditoria:

1. `userProfileSnapshotJson`
2. `uploadedContentSnapshotJson` (quando `adaptationSource=uploaded_content`)
3. `analysisInputSnapshotJson` (input final resolvido para análise/score)
4. `generationInputSnapshotJson` (input final resolvido para geração do CV)

Regras:

1. Snapshot representa dados efetivos do momento, não referência mutável ao estado atual.
2. Mudanças futuras do perfil não alteram snapshots de adaptações passadas.
3. `analysisInputSnapshotJson` e `generationInputSnapshotJson` devem permitir auditoria separada entre análise e geração.
4. `generationInputSnapshotJson` deve refletir a resolução final de prioridades usada pelo gerador.

Controle de tamanho dos snapshots:

1. quando houver `Resume` aplicável, salvar referência (`resumeId`) no snapshot;
2. persistir hash do conteúdo base (`sha256`) para integridade;
3. persistir input estruturado extraído usado no processamento;
4. persistir os dados finais resolvidos usados na geração;
5. evitar duplicação de `rawText` integral quando já houver referência segura no domínio.

---

## Regras de prioridade por modo

## Modo A: `adaptationSource=uploaded_content`

Válido para `inputMode=file_upload` e `inputMode=text_paste`.

1. Conteúdo enviado na requisição é a fonte principal para experiências, formação e narrativa profissional.
2. `UserProfile` complementa campos canônicos/faltantes (ex.: contato/localidade).
3. Não substituir automaticamente conteúdo principal enviado pelo usuário pelo perfil salvo.
4. Merge em `UserProfile` após análise segue regras de proteção de edição manual.

## Modo B: `adaptationSource=user_profile`

Válido para `inputMode=profile`.

1. `UserProfile` é a fonte principal para análise e geração.
2. `rawText`/CV Base podem apoiar contexto, mas não substituir a base canônica.
3. Nunca inventar dados não presentes nas fontes reais.
4. Se `inputMode=profile`, não aceitar arquivo/texto no mesmo request.
5. Se perfil não estiver `ready`, retornar erro controlado com mensagem clara.
6. Não fazer fallback silencioso para CV antigo.

---

## Fluxos obrigatórios

## Fluxo 1: usuário sem perfil canônico preenchido

1. Usuário envia CV (arquivo ou texto colado).
2. Sistema extrai estrutura e preenche `UserProfile` automaticamente.
3. Análise usa `uploaded_content` como base principal.
4. UI informa resumo do que foi extraído e permite revisão opcional.
5. Geração não é bloqueada por campos faltantes.

## Fluxo 2: usuário com perfil preenchido envia novo conteúdo para análise

1. Upload/cola texto roda análise com base principal no conteúdo enviado.
2. Merge no perfil preenche faltantes e cria sugestões para conflitos.
3. Dados manuais não são sobrescritos sem confirmação.

## Fluxo 3: usuário escolhe “usar perfil salvo”

1. Só habilitar opção quando `profileReadinessStatus=ready`.
2. Análise e geração usam `UserProfile` como base principal.

## Fluxo 4: upload/atualização de CV Base

1. CV Base alimenta merge com tipo `base_cv_upload`.
2. Pode atualizar dados previamente autoextraídos.
3. Não sobrescreve dados manuais sem confirmação.
4. Não apaga informação ausente no novo CV Base.
5. Persistir resumo de atualização e conflitos/sugestões.

---

## Merge inteligente (serviço central)

Criar uma função/serviço único para merge canônico e reutilizar em:

1. análise por upload/cola;
2. atualização de CV Base;
3. edições manuais.

Regras mínimas:

1. campo vazio pode ser preenchido automaticamente;
2. campo autoextraído pode ser atualizado por `base_cv_upload`;
3. campo com `manuallyEdited=true` não pode ser sobrescrito automaticamente;
4. conflito vira sugestão persistida (`pending`);
5. ausência no novo input não apaga dado existente;
6. skills com normalização e dedupe;
7. comparação heurística para experiências/formação;
8. normalização de contato antes de comparar (telefone, LinkedIn).

---

## UX e produto

### `/adaptar`

Manter 3 opções atuais:

1. Enviar CV (arquivo)
2. Colar CV em texto
3. Usar perfil salvo

Regra:

1. arquivo e texto seguem a mesma semântica de `uploaded_content`.
2. opção de perfil salvo deve respeitar readiness.

### Resultado da análise

Mostrar bloco discreto:

1. “Extraímos seu perfil a partir do currículo. Você pode revisar agora ou continuar.”
2. resumo numérico de dados detectados;
3. CTA opcional de revisão.

### `/cv-base`

Após upload/substituição:

1. resumo de adicionados/atualizados/pendentes de revisão;
2. CTA de revisão opcional;
3. sem bloquear jornada principal.

---

## Observabilidade e auditoria

Registrar:

1. `adaptationSource` e `inputMode` por adaptação;
2. snapshots usados;
3. eventos de merge (quantos campos preenchidos, atualizados, conflitados);
4. taxa de `profileReadinessStatus` por estado.
5. distinção auditável entre input de análise e input de geração.

Privacidade/LGPD:

1. novos campos canônicos, metadados e sugestões devem entrar no escopo de exportação de dados do usuário;
2. novos campos canônicos, metadados e sugestões devem entrar no escopo de exclusão/anonimização quando solicitado;
3. snapshots e referências devem respeitar políticas atuais de retenção e futuras rotinas de limpeza.

---

## Estratégia de rollout

## Fase 1 (este escopo)

1. schema + merge central + integração em fluxos novos;
2. snapshots por adaptação;
3. sugestões persistidas no `UserProfile`;
4. UX mínima opcional;
5. sem backfill massivo.

## Fase 2 (separada)

Backfill legado em feature/job dedicado, idempotente, com:

1. `dry-run`;
2. execução em chunks;
3. relatório de cobertura/conflitos;
4. sem sobrescrever dados manuais.

Não misturar implementação de backfill com deploy da Fase 1.

---

## Testes obrigatórios

1. usuário sem perfil envia arquivo e perfil é preenchido automaticamente;
2. usuário sem perfil cola texto e perfil é preenchido automaticamente;
3. arquivo/texto não sobrescrevem dado manual existente;
4. `base_cv_upload` atualiza dado autoextraído e preserva manual;
5. conflito vira sugestão `pending` persistida;
6. `profileReadinessStatus` muda conforme conteúdo do perfil;
7. `inputMode` e `adaptationSource` são persistidos corretamente;
8. `uploaded_content` prioriza conteúdo enviado na análise/geração;
9. `user_profile` prioriza perfil salvo na análise/geração;
10. `generationInputSnapshotJson` representa input final usado para gerar CV;
11. ausência de dado no novo CV Base não apaga dado existente;
12. skills fazem merge sem duplicatas;
13. experiências novas são detectadas como novas;
14. experiências similares geram atualização/sugestão coerente;
15. histórico de adaptação mantém rastreabilidade após edição posterior do perfil;
16. opção “usar perfil salvo” só aparece/habilita quando `profileReadinessStatus=ready`;
17. reordenar experiências não quebra metadados de edição manual (paths por `id` estável continuam válidos);
18. `inputMode=profile` com perfil não `ready` retorna erro controlado;
19. snapshot não muda após edição posterior do `UserProfile`.

---

## Riscos e mitigação

1. **Risco:** merge agressivo sobrescrever dados importantes.
   **Mitigação:** `manuallyEdited` granular por `fieldPath` + sugestões pendentes.

2. **Risco:** regressão no fluxo de adaptação atual.
   **Mitigação:** manter semântica atual de upload/texto e introduzir nova lógica atrás de validações e testes dedicados.

3. **Risco:** ambiguidade entre origem lógica e modo de entrada.
   **Mitigação:** persistir ambos (`adaptationSource` e `inputMode`) e usar regras explícitas de resolução.

4. **Risco:** inconsistência histórica após edições de perfil.
   **Mitigação:** snapshots imutáveis por adaptação (`userProfileSnapshot`, `uploadedContentSnapshot`, `analysisInputSnapshot`, `generationInputSnapshot`).

---

## Critério de aceite da feature

A feature está pronta quando:

1. `/adaptar` suporta claramente os 3 modos (arquivo, texto, perfil);
2. `UserProfile` atua como base canônica editável e complementar conforme modo;
3. regras de merge inteligente estão centralizadas e respeitam proteção de edição manual;
4. snapshots por adaptação garantem auditoria completa da base usada;
5. sugestões/conflitos ficam persistidos para revisão posterior;
6. UX permanece leve, opcional e sem bloqueio obrigatório;
7. suíte de testes cobre os cenários críticos listados nesta spec.
