import type { Metadata } from "next";

import {
  Badge,
  BrandMark,
  Button,
  Card,
  EmptyState,
  InfoField,
  Input,
  JobCard,
  PricingCard,
  SearchInput,
  SectionHeading,
  StatCard,
} from "@/components/ui";

import { getAbsoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "UI Showcase",
  description:
    "Showcase interno da biblioteca visual EarlyCV com componentes genericos inspirados nas telas do produto.",
  alternates: {
    canonical: getAbsoluteUrl("/ui"),
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function UIPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.18),_transparent_28%),linear-gradient(180deg,_#fff7ed_0%,_#fafaf9_36%,_#fafaf9_100%)] px-6 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <Card className="overflow-hidden" padding="lg" variant="accent">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-5">
              <div className="flex items-center gap-3">
                <BrandMark size="lg" />
                <Badge variant="dark">pencil to code</Badge>
              </div>
              <div className="space-y-4">
                <p className="font-mono text-sm font-bold uppercase tracking-[0.22em] text-white">
                  Biblioteca de componentes EarlyCV
                </p>
                <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
                  Showcase dos componentes genericos extraidos de todas as telas
                  do Pencil.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-white/82">
                  A linguagem visual mistura o hero quente da landing, os cards
                  claros do dashboard, os estados do fluxo de alertas e os
                  blocos estruturados das telas de onboarding, vaga e adaptacao
                  de curriculo.
                </p>
              </div>
            </div>

            <Card
              className="w-full max-w-md space-y-4"
              padding="md"
              variant="ghost"
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white/72">
                Componentes mapeados
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm text-white/88">
                <p>Button</p>
                <p>Badge</p>
                <p>Card</p>
                <p>BrandMark</p>
                <p>Input</p>
                <p>SearchInput</p>
                <p>InfoField</p>
                <p>StatCard</p>
                <p>JobCard</p>
                <p>PricingCard</p>
                <p>EmptyState</p>
                <p>SectionHeading</p>
              </div>
            </Card>
          </div>
        </Card>

        <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="space-y-6" variant="default">
            <SectionHeading
              eyebrow="acoes"
              title="Buttons, badges e identidade base"
              description="Estados extraidos dos CTAs da landing, detalhe da vaga, onboarding e fluxos internos."
            />
            <div className="flex flex-wrap gap-3">
              <Button>Montar meu radar</Button>
              <Button variant="secondary">Ver sinais</Button>
              <Button variant="outline">Salvar vaga</Button>
              <Button variant="ghost">Mais tarde</Button>
              <Button variant="dark">Exportar PDF</Button>
              <Button size="icon" aria-label="Adicionar">
                +
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="accent">captada primeiro</Badge>
              <Badge variant="success">fit 91/100</Badge>
              <Badge variant="neutral">editavel</Badge>
              <Badge variant="outline">privacidade ativa</Badge>
              <BrandMark />
            </div>
          </Card>

          <Card className="space-y-6" variant="default">
            <SectionHeading
              eyebrow="entrada"
              title="Campos e busca"
              description="Blocos de entrada inspirados no onboarding, filtros e radar de vagas."
            />
            <div className="space-y-4">
              <Input placeholder="Seu email profissional" />
              <SearchInput />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <InfoField
                label="Cargos de interesse"
                description="Product Manager, Data Analyst, Software Engineer"
              />
              <InfoField
                label="Localizacao"
                description="Sao Paulo, remoto e hibrido"
              />
            </div>
          </Card>
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="dashboard"
            title="Cards estruturais para dados, contexto e monitoramento"
            description="A mesma base atende beneficios da landing, metricas do dashboard, alertas e cards de apoio."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard label="Novas vagas em 24h" value="63" />
            <StatCard label="Vagas com alto fit" tone="success" value="18" />
            <StatCard label="CVs adaptados" tone="accent" value="11" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="space-y-3" variant="muted">
              <h3 className="text-xl font-bold text-stone-900">
                Velocidade real
              </h3>
              <p className="text-sm leading-6 text-stone-500">
                Descubra vagas novas antes da maior parte dos candidatos.
              </p>
            </Card>
            <Card className="space-y-3" variant="default">
              <h3 className="text-xl font-bold text-stone-900">Score de fit</h3>
              <p className="text-sm leading-6 text-stone-500">
                Veja o potencial de aderencia e concentre energia no que combina
                melhor com o seu perfil.
              </p>
              <Badge variant="success">fit 87/100</Badge>
            </Card>
            <EmptyState
              title="Ainda nao ha alertas pausados"
              description="Quando voce pausar um alerta, ele aparece aqui com historico e frequencia anterior."
            />
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="listas"
            title="Cards para oportunidades e fluxo operacional"
            description="Estrutura reutilizavel para radar, alertas, detalhe da vaga e recomendacoes acionaveis."
          />
          <div className="space-y-4">
            <JobCard
              company="Nubank"
              title="Senior Product Manager"
              meta="Produto | Sao Paulo + hibrido | publicada no portal da empresa ha 2h"
              fitLabel="fit 91/100"
              signal="captada antes do LinkedIn"
            />
            <JobCard
              company="Natura"
              title="Vaga de Gerente de Dados"
              meta="Dados | Sao Paulo | monitoramento em tempo real com prioridade alta"
              fitLabel="fit 87/100"
              signal="2h antes"
            />
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="planos"
            title="Blocos de comparacao comercial"
            description="Os cartoes de preco seguem o contraste da secao de planos e suportam destaque para o plano principal."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <PricingCard
              plan="Free"
              description="Radar basico e 3 adaptacoes por mes."
              price="R$ 0"
            />
            <PricingCard
              featured
              plan="Pro"
              description="Mais velocidade, mais monitoramento e CV adaptado sem friccao."
              price="R$ 49"
            />
            <PricingCard
              plan="Premium"
              description="Alertas avancados, historico completo e mais personalizacao."
              price="R$ 99"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
