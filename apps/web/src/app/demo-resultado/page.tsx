"use client";

import type { CvAnalysisData } from "@/lib/cv-adaptation-api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const MOCK_DATA: CvAnalysisData = {
  vaga: {
    cargo: "Engenheira de Dados Sênior",
    empresa: "Nubank",
  },
  fit: {
    score: 42,
    score_pos_ajustes: 87,
    categoria: "baixo",
    headline:
      "Seu perfil tem base sólida, mas keywords críticas da vaga estão ausentes — o ATS está eliminando você antes de alguém ler.",
    subheadline:
      "Com os ajustes identificados, sua compatibilidade sobe de 42 para 87 pontos.",
  },
  secoes: {
    experiencia: { score: 14, max: 40 },
    competencias: { score: 12, max: 40 },
    formatacao: { score: 8, max: 20 },
  },
  positivos: [
    { texto: "Experiência sólida com pipelines de dados em Python e Airflow", pontos: 12 },
    { texto: "Histórico comprovado com métricas de impacto (30% redução de latência)", pontos: 9 },
    { texto: "Familiaridade com ambiente de alto volume — dados bancários/fintech", pontos: 8 },
    { texto: "Formação em Ciência da Computação diretamente alinhada à vaga", pontos: 6 },
    { texto: "Experiência com AWS S3 e arquitetura cloud citada na descrição", pontos: 5 },
  ],
  ajustes_conteudo: [
    {
      id: "a0",
      titulo: "dbt não aparece no CV — é exigência explícita da vaga",
      descricao:
        "A vaga cita dbt como requisito obrigatório. Você usou dbt em dois projetos mas não mencionou no currículo.",
      pontos: 13,
      dica: "Adicione 'dbt (data build tool)' na seção de competências e mencione nos projetos onde aplicou.",
    },
    {
      id: "a1",
      titulo: "Resumo profissional genérico demais para ATS",
      descricao:
        "Seu resumo atual começa com 'Profissional motivada com experiência em dados'. ATS prioriza densidade de keywords no resumo.",
      pontos: 11,
      dica: "Reescreva para: 'Engenheira de Dados com 5 anos em pipelines Python/Airflow/dbt, especializada em ambientes de alto volume financeiro.'",
    },
    {
      id: "a2",
      titulo: "Databricks listado só nas competências — precisa aparecer nas experiências",
      descricao:
        "A vaga exige uso prático de Databricks. Apenas listar na seção de habilidades tem peso menor no ATS.",
      pontos: 9,
      dica: "Inclua Databricks nas descrições das experiências onde foi utilizado.",
    },
    {
      id: "a3",
      titulo: "Impacto de negócio ausente em 3 dos 4 cargos",
      descricao:
        "Descricoes como 'responsavel por ETL' nao comunicam valor. Recrutadores e ATS buscam resultados.",
      pontos: 7,
      dica: "Exemplo: 'Reduzi tempo de processamento de 4h para 25min, habilitando relatorios em tempo real para o time financeiro.'",
    },
    {
      id: "a4",
      titulo: "Spark não citado — aparece 4 vezes no JD",
      descricao:
        "Apache Spark é mencionado quatro vezes na descrição da vaga mas está ausente do seu currículo.",
      pontos: 5,
      dica: "Se já utilizou Spark, adicione explicitamente. Se não, mencione PySpark se aplicável.",
    },
  ],
  keywords: {
    presentes: [
      { kw: "Python", pontos: 5 },
      { kw: "Airflow", pontos: 4 },
      { kw: "SQL", pontos: 4 },
      { kw: "AWS S3", pontos: 3 },
      { kw: "ETL", pontos: 3 },
    ],
    ausentes: [
      { kw: "dbt", pontos: 6 },
      { kw: "Spark / PySpark", pontos: 5 },
      { kw: "Databricks", pontos: 4 },
      { kw: "Data Lakehouse", pontos: 3 },
      { kw: "Great Expectations", pontos: 2 },
    ],
  },
  formato_cv: {
    ats_score: 8,
    resumo:
      "Formato com problemas críticos — tabelas bloqueiam leitura automática e o resumo não prioriza keywords.",
    problemas: [
      {
        tipo: "critico",
        titulo: "Tabelas no PDF bloqueiam leitura ATS",
        descricao:
          "Células de tabela quebram o parser da maioria dos sistemas de triagem automática.",
        impacto: -5,
      },
      {
        tipo: "atencao",
        titulo: "Fontes mistas (3 famílias tipográficas)",
        descricao:
          "Reduz legibilidade e sinaliza falta de atenção ao detalhe para recrutadores.",
        impacto: -2,
      },
      {
        tipo: "atencao",
        titulo: "Resumo profissional sem keywords no 1º parágrafo",
        descricao: "ATS dá mais peso ao topo do documento.",
        impacto: -2,
      },
      {
        tipo: "ok",
        titulo: "Formato de datas consistente (mm/aaaa)",
        descricao: "Facilita parsing de experiências pelo ATS.",
        impacto: 0,
      },
    ],
    campos: [
      { nome: "Nome completo", presente: true },
      { nome: "E-mail", presente: true },
      { nome: "Telefone", presente: true },
      { nome: "LinkedIn", presente: true },
      { nome: "Localização", presente: true },
      { nome: "Resumo profissional", presente: true },
      { nome: "Formação acadêmica", presente: true },
      { nome: "Experiências com datas", presente: true },
      { nome: "Habilidades e Competências", presente: true },
    ],
  },
  comparacao: {
    antes: `ANA SOUZA
São Paulo, SP | ana.souza@email.com | (11) 9 9999-0000

OBJETIVO
Profissional motivada com experiência em dados buscando nova oportunidade na área.

EXPERIÊNCIA

Analista de Dados Sênior — Fintech XYZ (2020–atual)
• Responsável pelo ETL de dados de transações
• Trabalhou com Python e SQL no dia a dia
• Ajudou na migração para cloud

Analista de Dados — Banco ABC (2018–2020)
• Criação de dashboards e relatórios
• Manutenção de pipelines de dados`,
    depois: `ANA SOUZA
São Paulo, SP · ana.souza@email.com · (11) 9 9999-0000 · linkedin.com/in/anasouza

RESUMO
Engenheira de Dados Sênior com 6 anos em pipelines de alto volume (Python, Airflow, dbt, Spark). Especializada em ambientes fintech — reduzi latência de processamento em 30% e habilitei real-time reporting para produto com 2M usuários ativos.

EXPERIÊNCIA

Engenheira de Dados Sênior — Fintech XYZ (jan/2020–atual)
• Arquitetei e mantive pipelines de ingestão (Airflow + dbt) processando 80 GB/dia de dados de transação
• Migrei ETL legado para Data Lakehouse no AWS (S3 + Databricks), reduzindo custo em 40%
• Implementei testes de qualidade com Great Expectations — 0 incidentes críticos em produção em 18 meses

Engenheira de Dados — Banco ABC (mar/2018–dez/2019)
• Desenvolvi 15 pipelines Spark para consolidação de dados regulatórios (BACEN)
• Reduzi tempo de carga de relatórios mensais de 4h para 25 min`,
  },
  // legacy fields
  pontos_fortes: [],
  lacunas: [],
  melhorias_aplicadas: [],
  ats_keywords: { presentes: [], ausentes: [] },
  preview: {
    antes: `Analista de Dados Sênior — Fintech XYZ (2020–atual)
• Responsável pelo ETL de dados de transações
• Trabalhou com Python e SQL no dia a dia
• Ajudou na migração para cloud AWS`,
    depois: `Engenheira de Dados Sênior — Fintech XYZ (jan/2020–atual)
• Arquitetei e mantive pipelines de ingestão (Airflow + dbt) processando 80 GB/dia de dados de transação financeira
• Migrei ETL legado para Data Lakehouse no AWS (S3 + Databricks), reduzindo custo de infraestrutura em 40%
• Implementei testes de qualidade com Great Expectations — 0 incidentes críticos em produção em 18 meses consecutivos`,
  },
  projecao_melhoria: {
    score_atual: 42,
    score_pos_otimizacao: 87,
    explicacao_curta: "Ajustes de keywords e conteúdo aumentam compatibilidade de 42 para 87.",
  },
  mensagem_venda: {
    titulo: "Seu CV otimizado está pronto",
    subtexto: "Baixe o PDF/DOCX ajustado para esta vaga e aumente suas chances de entrevista.",
  },
};

export default function DemoResultadoPage() {
  const router = useRouter();

  useEffect(() => {
    sessionStorage.setItem(
      "guestAnalysis",
      JSON.stringify({
        adaptedContentJson: MOCK_DATA,
        previewText: MOCK_DATA.comparacao.depois,
        jobDescriptionText:
          "Engenheira de Dados Sênior — Nubank. Requisitos: Python, Airflow, dbt, Spark, Databricks, SQL, AWS S3, Data Lakehouse, Great Expectations.",
        masterCvText: MOCK_DATA.comparacao.antes,
      }),
    );
    router.replace("/adaptar/resultado?demo=1");
  }, [router]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "2px solid rgba(10,10,10,0.1)",
          borderTopColor: "#0a0a0a",
          animation: "spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
