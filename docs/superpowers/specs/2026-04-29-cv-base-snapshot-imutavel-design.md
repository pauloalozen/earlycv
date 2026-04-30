# Design: Snapshot imutável do CV-base da análise + download no dashboard

## Contexto

Hoje, em fluxo autenticado com CV master existente, a análise por texto pode ser calculada corretamente, mas a geração do CV adaptado pode usar `masterResume.rawText` atual em vez do CV efetivamente usado na análise.

Isso quebra rastreabilidade, histórico e confiança do usuário, pois uma adaptação antiga pode ser gerada ou baixada com base em um CV diferente daquele usado originalmente na análise.

## Regra de produto

1. O CV adaptado deve sempre ser gerado com base no mesmo CV usado na análise.
2. Esse vínculo deve ser histórico e imutável, independentemente de alterações posteriores no CV master.
3. Não alterar, por enquanto, a quantidade de chamadas de API para IA.
4. O usuário deve poder conferir, pelo dashboard, qual CV-base foi usado naquela análise/adaptação.

---

# Objetivos

1. Congelar no backend um snapshot textual do CV-base no momento da análise.
2. Vincular cada `cvAdaptation` ao snapshot imutável da própria análise.
3. Garantir que geração, entrega e download do CV adaptado usem esse snapshot, nunca o master atual.
4. Expor no dashboard um botão para baixar o CV-base usado na análise/adaptação.
5. Separar claramente:
   - o texto efetivamente usado pela IA;
   - o arquivo original enviado pelo usuário, quando houver.

---

# Fora de escopo

1. Reduzir número de chamadas de IA.
2. Refatorar pipeline de pagamento, checkout ou templates.
3. Revisar UX completa do dashboard além do novo botão de conferência.
4. Fazer backfill obrigatório dos registros antigos.
5. Implementar compressão ou política avançada de retenção de snapshots nesta fase.

---

# Definição funcional

## Conceito

Introduzir o conceito de **Analysis CV Snapshot**.

O snapshot é um artefato imutável criado no backend, contendo o texto base efetivamente utilizado na análise.

Esse texto é a fonte histórica da adaptação.

Quando houver upload de arquivo, o sistema pode também manter referência ao arquivo original, mas a geração do CV adaptado deve usar sempre o snapshot textual, não o arquivo original nem o master atual.

---

# Regras obrigatórias

1. O snapshot textual é criado sempre no backend durante:
   - `/cv-adaptation/analyze`;
   - `/cv-adaptation/analyze-guest`.

2. O conteúdo do snapshot textual deve refletir exatamente o `masterCvText` final usado na análise, após resolver a prioridade de entrada.

3. Toda geração do CV adaptado deve usar o snapshot vinculado à adaptação.

4. O master atual do usuário não pode ser usado como base principal para adaptação paga em registros novos.

5. O frontend nunca deve enviar novamente o texto do CV-base para geração final como fonte de verdade.

6. Para registros novos, ausência de snapshot deve ser erro bloqueante.

7. Fallback legado só é permitido para registros antigos criados antes da migration/release deste recurso.

8. O vínculo entre `cvAdaptation` e `AnalysisCvSnapshot` não pode ser alterado após criado.

9. O storage key do snapshot deve ser único e nunca sobrescrito.

10. O snapshot textual não pode passar por reescrita semântica, melhoria por IA, correção ortográfica ou qualquer transformação de conteúdo.

---

# Prioridade de fonte no analyze

A prioridade atual deve ser mantida:

1. `masterCvText` enviado explicitamente.
2. Texto extraído de arquivo uploadado no request.
3. `rawText` de `masterResumeId` informado.

O snapshot deve ser criado a partir do valor final resolvido nessa cadeia.

---

# Normalização técnica permitida

Antes de salvar o snapshot textual e calcular o hash, aplicar apenas normalização técnica mínima:

1. Converter `CRLF`/`CR` para `LF`.
2. Remover BOM UTF-8, se existir.
3. Aplicar `trim` apenas no início e no fim do documento.
4. Não alterar espaços internos.
5. Não reordenar conteúdo.
6. Não remover seções vazias.
7. Não corrigir ortografia.
8. Não reescrever frases.
9. Não passar por IA.

O hash SHA-256 deve ser calculado depois dessa normalização.

---

# Integridade e imutabilidade

1. O snapshot textual deve ser criado a partir do mesmo buffer textual usado na chamada de análise da IA.

2. O conteúdo enviado para IA deve ser equivalente ao conteúdo hasheado e salvo como snapshot textual, exceto por wrappers técnicos explícitos do prompt.

3. O texto usado na geração do CV adaptado deve ser lido do snapshot persistido.

4. O texto usado na geração não pode vir:
   - do master atual;
   - de payload reenviado pelo frontend;
   - de input manual posterior;
   - de arquivo original reprocessado.

5. Para registros novos, ausência de `analysisCvSnapshotId` deve bloquear geração/download da adaptação.

6. Fallback legado só pode ocorrer quando:
   - `cvAdaptation.analysisCvSnapshotId` for nulo;
   - e o registro tiver sido criado antes da release/migration deste recurso.

7. Depois que uma `cvAdaptation` estiver vinculada a um snapshot, esse vínculo não pode ser substituído.

8. O snapshot textual e seus metadados principais não podem ser atualizados depois de criados.

9. Qualquer tentativa de sobrescrever snapshot deve falhar.

---

# Formato dos artefatos

## Snapshot textual

1. Formato: `.md`.
2. Conteúdo: texto fiel ao CV-base usado na análise.
3. Normalização: apenas a normalização técnica definida nesta spec.
4. Uso principal:
   - análise;
   - geração do CV adaptado;
   - auditoria;
   - fallback de download quando não houver arquivo original.

## Arquivo original

Quando a fonte for upload, o sistema deve preservar, se já for compatível com o fluxo atual de storage, referência ao arquivo original enviado pelo usuário.

O arquivo original serve para conferência/download no dashboard, mas não deve ser usado como fonte principal da geração do CV adaptado.

A fonte principal da geração é sempre o snapshot textual.

---

# Metadados mínimos

Persistir os metadados em entidade dedicada `AnalysisCvSnapshot`.

## Campos obrigatórios

1. `id`
2. `sourceType`
   - `text_input`
   - `uploaded_file`
   - `master_resume`
3. `textStorageKey`
4. `textSha256`
5. `textSizeBytes`
6. `capturedAt`
7. `createdAt`
8. `updatedAt`

## Campos de ownership / guest

1. `userId`, quando autenticado.
2. `guestSessionHash`, quando guest.
3. `expiresAt`, quando aplicável.
4. `claimedAt`, quando guest for associado a usuário.
5. `claimedByUserId`, quando guest for associado a usuário.

## Campos de arquivo original

Quando fonte for upload:

1. `originalFileStorageKey`
2. `originalFileSha256`
3. `originalFileName`
4. `originalMimeType`
5. `originalFileSizeBytes`

Campos de arquivo original podem ser nulos quando a origem for texto digitado ou master resume.

---

# Modelo de dados sugerido

Preferir tabela dedicada em vez de jogar tudo dentro de `cvAdaptation`.

Motivo: o snapshot tem ciclo de vida próprio. Ele pode nascer antes da adaptação, pode ser guest, pode expirar, pode ser reclamado por um usuário e pode ficar órfão temporariamente.

## Prisma sugerido

```prisma
model AnalysisCvSnapshot {
  id                    String   @id @default(cuid())

  userId                String?
  guestSessionHash       String?

  sourceType             AnalysisCvSourceType

  textStorageKey         String
  textSha256             String
  textSizeBytes          Int

  originalFileStorageKey String?
  originalFileSha256     String?
  originalFileName       String?
  originalMimeType       String?
  originalFileSizeBytes  Int?

  capturedAt             DateTime @default(now())
  expiresAt              DateTime?
  claimedAt              DateTime?
  claimedByUserId        String?

  cvAdaptationId         String?  @unique
  cvAdaptation           CvAdaptation? @relation(fields: [cvAdaptationId], references: [id])

  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@index([userId])
  @@index([guestSessionHash])
  @@index([expiresAt])
  @@index([textSha256])
}

enum AnalysisCvSourceType {
  text_input
  uploaded_file
  master_resume
}
```
