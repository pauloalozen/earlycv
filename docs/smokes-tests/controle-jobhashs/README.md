# EarlyCV Hash Fixtures

Pacote de testes manuais/automatizáveis para validar `rawJobHash` e `canonicalJobHash`.

## Como usar

Para cada pasta:

1. Calcule `rawJobHash` dos arquivos `.txt`.
2. Calcule `canonicalJobHash` dos mesmos arquivos, passando antes pelo canonicalizador LLM.
3. Compare com o `expected.json`.

### Script versionado

Da raiz do monorepo:

```bash
npm run run --prefix docs/smokes-tests/controle-jobhashs
```

O script:

1. carrega `OPENAI_API_KEY` do `.env` da raiz, se existir;
2. executa a canonicalização LLM real em cada caso do `manifest.json` e `manifest_en.json`;
3. compara `rawJobHash`, `canonicalJobHash` e, quando definido, `requirementSourceHash` com o esperado;
4. imprime `requirementSourceHash` como sinal adicional de reutilização de requisitos;
5. retorna exit code `1` se algum caso falhar.

## Interpretação

- `rawHash: MATCH`: os arquivos devem gerar o mesmo rawJobHash.
- `rawHash: DIFFERENT`: os arquivos devem gerar rawJobHash diferente.
- `canonicalHash: MATCH`: os arquivos devem gerar o mesmo canonicalJobHash.
- `canonicalHash: DIFFERENT`: os arquivos devem gerar canonicalJobHash diferente.

## Casos

Os manifests atuais cobrem cenários em PT e EN, incluindo ruído típico de LinkedIn, Gupy, Greenhouse, Indeed e Workday.


1. `01_rawhash_match`
   - Mesmo texto com diferenças de caixa/espaçamento.
   - Deve bater rawHash e canonicalHash.

2. `02_canonicalhash_match_linkedin_noise`
   - Mesma vaga com ruído de LinkedIn.
   - RawHash deve falhar, canonicalHash deve bater.

3. `03_canonicalhash_match_gupy_noise`
   - Mesma vaga com ruído de plataforma de candidatura.
   - RawHash deve falhar, canonicalHash deve bater.

4. `04_both_fail_different_role`
   - Vagas realmente diferentes.
   - Ambos devem falhar.

5. `05_both_fail_same_title_different_requirements`
   - Mesmo título e empresa, mas stack/requisitos diferentes.
   - Ambos devem falhar.

6. `06_canonicalhash_should_not_match_if_seniority_changes`
   - Cargo parecido, senioridade diferente.
   - Ambos devem falhar.

## Observação

O canonicalizador não deve resumir a vaga.
Ele deve limpar ruído e preservar requisitos, responsabilidades e qualificações.
Se ele resumir demais, vai gerar falso positivo. Aí parabéns, criamos um hash com vocação para horóscopo.
