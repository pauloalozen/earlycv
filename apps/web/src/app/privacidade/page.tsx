import type { Metadata } from "next";
import Link from "next/link";

import { getAbsoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Politica de Privacidade | EarlyCV",
  description:
    "Entenda como o EarlyCV coleta, utiliza, compartilha e protege dados pessoais para operar o servico de analise e adaptacao de curriculo.",
  alternates: {
    canonical: getAbsoluteUrl("/privacidade"),
  },
  openGraph: {
    url: getAbsoluteUrl("/privacidade"),
    title: "Politica de Privacidade | EarlyCV",
    description:
      "Regras de tratamento de dados pessoais no EarlyCV, incluindo finalidades, bases legais, compartilhamento e direitos do titular.",
  },
  twitter: {
    title: "Politica de Privacidade | EarlyCV",
    description:
      "Regras de tratamento de dados pessoais no EarlyCV, incluindo finalidades, bases legais, compartilhamento e direitos do titular.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA] px-6 py-10 text-[#1C1917] md:px-10">
      <div className="mx-auto w-full max-w-4xl space-y-8">
        <header className="space-y-3">
          <Link
            className="text-sm text-[#C2410C] hover:text-[#9A3412]"
            href="/"
          >
            Voltar para a home
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-[#111111]">
            Politica de Privacidade
          </h1>
          <p className="text-sm text-[#57534E]">
            Ultima atualizacao: 14/04/2026
          </p>
          <p className="text-sm leading-6 text-[#44403C]">
            Esta Politica de Privacidade descreve como o EarlyCV trata dados
            pessoais no contexto do fornecimento de servicos de analise de
            vagas, adaptacao de curriculo e funcionalidades relacionadas. Ao
            usar a plataforma, voce declara ciencia e concordancia com os termos
            abaixo.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-5">
          <h2 className="text-lg font-semibold text-[#9A3412]">
            Consentimento e aceite
          </h2>
          <p className="text-sm leading-6 text-[#7C2D12]">
            Ao criar conta, enviar curriculo, colar descricao de vaga, integrar
            login social ou continuar navegando em funcionalidades autenticadas,
            voce consente com o tratamento de dados pessoais nos limites desta
            politica, da legislacao aplicavel (incluindo LGPD) e dos Termos de
            Uso do EarlyCV.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            1. Dados coletados
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#44403C]">
            <li>
              Dados de cadastro e autenticacao (nome, email, identificadores de
              sessao e tokens).
            </li>
            <li>
              Dados de perfil profissional informados por voce (headline,
              localidade e informacoes correlatas).
            </li>
            <li>
              Dados de curriculo e historico de adaptacoes (arquivos, texto
              extraido, metadados e resultados).
            </li>
            <li>
              Dados de uso e telemetria tecnica (logs, IP, dispositivo, datas e
              horarios de acesso).
            </li>
            <li>
              Dados de pagamento e compra de planos, observadas as informacoes
              efetivamente disponibilizadas pelos provedores de pagamento.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            2. Finalidades e bases legais
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            O EarlyCV trata dados para: (a) executar o contrato e prestar o
            servico solicitado; (b) autenticar contas e proteger o ambiente; (c)
            operar credito, limite diario e recursos de assinatura; (d) cumprir
            obrigacoes legais e regulatórias; (e) prevenir fraude, abuso e uso
            indevido; e (f) aprimorar seguranca, estabilidade e qualidade do
            servico, com base em interesse legitimo quando cabivel.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            3. Compartilhamento de dados
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Dados podem ser compartilhados com operadores e subprocessadores
            necessarios para hospedagem, autenticacao, armazenamento,
            processamento de IA, monitoramento, pagamentos e comunicacoes
            transacionais, sempre no limite necessario para execucao
            operacional. O EarlyCV tambem pode compartilhar dados mediante
            obrigacao legal, ordem judicial ou para exercicio regular de
            direitos em processos administrativos, arbitrais ou judiciais.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            4. Uso de IA e dados profissionais
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Ao submeter curriculo e descricao de vaga, voce autoriza o
            tratamento dessas informacoes para gerar analises e sugestoes de
            adaptacao. Voce declara ter legitimidade para enviar os dados e
            assume responsabilidade pelo conteudo submetido. O EarlyCV nao
            garante entrevista, contratacao, aprovacao em processos seletivos ou
            qualquer resultado profissional especifico.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            5. Retencao, seguranca e transferencia
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Dados sao armazenados pelo periodo necessario para as finalidades
            descritas, cumprimento de obrigacoes legais e defesa de direitos. O
            EarlyCV adota medidas tecnicas e administrativas razoaveis de
            seguranca, sem garantia absoluta contra incidentes. Dependendo da
            infraestrutura de fornecedores, pode haver transferencia
            internacional de dados, com salvaguardas contratuais e controles
            compativeis.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            6. Direitos do titular
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Nos termos da LGPD, voce pode solicitar confirmacao de tratamento,
            acesso, correcao, anonimizaçao quando aplicavel, portabilidade,
            eliminacao de dados tratados por consentimento e informacoes sobre
            compartilhamento. Para exercicio desses direitos, contate:
            <span className="font-medium"> privacidade@earlycv.app</span>.
          </p>
        </section>

        <section className="space-y-4 pb-8">
          <h2 className="text-xl font-semibold text-[#111111]">
            7. Atualizacoes desta politica
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Esta politica pode ser alterada a qualquer tempo para refletir
            evolucoes legais, tecnicas e de produto. A versao vigente sera
            sempre publicada nesta rota, com indicacao da data de atualizacao.
          </p>
        </section>
      </div>
    </main>
  );
}
