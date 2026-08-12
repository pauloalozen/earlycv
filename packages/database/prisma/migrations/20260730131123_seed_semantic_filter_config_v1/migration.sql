-- Seed inicial do filtro semantico do Radar de Oportunidades (Sprint 1).
-- Idempotente via ON CONFLICT no "version" unico: reaplicar em qualquer
-- ambiente (dev/test/prod) nao duplica nem sobrescreve edicoes feitas
-- depois pelo admin (Parte 5.1 da spec sempre cria versao nova, nunca
-- edita a atual).
INSERT INTO "SemanticFilterConfig" (
  "id",
  "version",
  "isActive",
  "techSignals",
  "noiseSignals",
  "description",
  "createdAt",
  "updatedAt"
)
VALUES (
  'seed-semantic-filter-config-v1',
  'v1',
  true,
  ARRAY[
    'desenvolvedor', 'developer', 'engenheiro', 'engineer',
    'analista de dados', 'data analyst', 'data engineer', 'data science',
    'software', 'backend', 'front-end', 'frontend', 'full stack', 'fullstack',
    'mobile', 'devops', 'cloud', 'sre', 'platform', 'site reliability',
    'produto', 'product manager', 'product owner', 'ux', 'ui designer',
    'qa', 'quality assurance', 'teste', 'tester', 'automação de testes',
    'segurança', 'security', 'cybersecurity', 'cyber', 'pentest',
    'infraestrutura', 'infra', 'redes', 'network',
    'arquiteto', 'architect', 'solutions architect',
    'scrum master', 'agile coach', 'tech lead', 'cto', 'cio',
    'machine learning', 'inteligência artificial', 'ia', 'llm', 'mlops',
    'analytics', 'business intelligence', 'bi ', ' bi',
    'database', 'dba', 'banco de dados',
    'suporte de ti', 'suporte técnico ti', 'analista de ti',
    'sistemas', 'analista de sistemas',
    'gerente de ti', 'coordenador de ti', 'head de tecnologia',
    'head de dados', 'head de produto', 'head de engenharia'
  ]::text[],
  ARRAY[
    'enfermeiro', 'técnico de enfermagem', 'médico', 'farmacêutico',
    'biomédico', 'fisioterapeuta', 'psicólogo', 'nutricionista',
    'recepcionista', 'atendente', 'operador de caixa',
    'vendedor', 'assistente de vendas', 'agente de vendas',
    'montador', 'mecânico', 'eletricista', 'soldador',
    'motorista', 'operador de máquinas',
    'assistente de loja', 'fiscal de loja', 'gerente de loja',
    'estoquista', 'armazenista', 'almoxarife',
    'auxiliar de limpeza', 'zelador', 'porteiro',
    'aprendiz', 'jovem aprendiz',
    'pedagogo', 'professor', 'docente',
    'advogado', 'contador', 'analista contábil', 'analista fiscal'
  ]::text[],
  'Seed inicial Sprint 1 do Radar de Oportunidades',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("version") DO NOTHING;
