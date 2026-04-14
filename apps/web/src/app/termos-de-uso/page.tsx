import type { Metadata } from "next";
import Link from "next/link";

import { getAbsoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Termos de Uso | EarlyCV",
  description:
    "Condicoes de uso do EarlyCV, incluindo regras de acesso, responsabilidades do usuario, limitacao de responsabilidade e disposicoes legais.",
  alternates: {
    canonical: getAbsoluteUrl("/termos-de-uso"),
  },
  openGraph: {
    url: getAbsoluteUrl("/termos-de-uso"),
    title: "Termos de Uso | EarlyCV",
    description:
      "Regras juridicas de utilizacao da plataforma EarlyCV e condicoes para uso dos servicos.",
  },
  twitter: {
    title: "Termos de Uso | EarlyCV",
    description:
      "Regras juridicas de utilizacao da plataforma EarlyCV e condicoes para uso dos servicos.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function TermsPage() {
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
            Termos de Uso
          </h1>
          <p className="text-sm text-[#57534E]">
            Ultima atualizacao: 14/04/2026
          </p>
          <p className="text-sm leading-6 text-[#44403C]">
            Estes Termos de Uso regulam o acesso e uso da plataforma EarlyCV. Ao
            criar conta, navegar em area autenticada ou utilizar qualquer
            funcionalidade do servico, voce declara leitura, ciencia e aceite
            integral destes termos.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border border-[#FED7AA] bg-[#FFF7ED] p-5">
          <h2 className="text-lg font-semibold text-[#9A3412]">
            Natureza do servico e ausencia de garantia de resultado
          </h2>
          <p className="text-sm leading-6 text-[#7C2D12]">
            O EarlyCV fornece ferramenta de apoio informacional para analise de
            aderencia entre curriculo e vaga, sem promessa de contratacao,
            entrevista, progresso em processo seletivo ou qualquer resultado
            profissional. O servico e prestado no estado em que se encontra ("as
            is"), dentro dos limites tecnicos e operacionais da plataforma.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            1. Elegibilidade e conta
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Voce deve possuir capacidade legal para contratar e se compromete a
            manter dados de cadastro corretos e atualizados. Credenciais de
            acesso sao pessoais, intransferiveis e de sua responsabilidade
            exclusiva. O EarlyCV pode suspender ou encerrar contas em caso de
            fraude, violacao destes termos, risco de seguranca ou exigencia
            legal.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            2. Regras de uso e condutas vedadas
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#44403C]">
            <li>
              Usar o servico para fins ilicitos, discriminatorios, difamatorios
              ou em violacao a direitos de terceiros.
            </li>
            <li>
              Enviar dados sem base legal, consentimento ou legitimidade para
              tratamento.
            </li>
            <li>
              Tentar contornar limites tecnicos, creditos, autenticacao,
              seguranca ou controles antiabuso.
            </li>
            <li>
              Realizar engenharia reversa, scraping nao autorizado, automacao
              abusiva ou interferencia na infraestrutura.
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            3. Conteudo do usuario e licenca de uso
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Voce permanece titular do conteudo enviado, mas concede ao EarlyCV
            licenca nao exclusiva para processar, armazenar, transformar e
            exibir os dados estritamente para operacao da plataforma, prevencao
            de abuso, auditoria, suporte e melhoria do servico. Voce declara que
            o conteudo submetido nao infringe direitos de terceiros.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            4. Planos, creditos e pagamentos
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Planos, creditos, limites diarios e condicoes comerciais podem
            variar conforme oferta vigente. O acesso a funcionalidades pagas
            depende de confirmacao de pagamento e cumprimento das regras da
            plataforma. Estornos, cancelamentos e disputas obedecem a legislacao
            aplicavel, aos termos de pagamento e as politicas especificas
            divulgadas no fluxo de compra.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            5. Limitacao de responsabilidade
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Na maxima extensao permitida por lei, o EarlyCV, seus socios,
            administradores, empregados e fornecedores nao respondem por danos
            indiretos, lucros cessantes, perda de chance, danos reputacionais,
            indisponibilidade temporaria, falhas de terceiros, ou por decisoes
            de recrutadores e empresas contratantes. A responsabilidade total do
            EarlyCV, quando aplicavel, fica limitada ao montante efetivamente
            pago pelo usuario nos 12 meses anteriores ao evento que deu causa a
            reclamacao.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            6. Indenizacao
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Voce concorda em indenizar e manter o EarlyCV indene de perdas,
            custos, danos, responsabilidades e despesas decorrentes de uso
            ilicito da plataforma, violacao destes termos, violacao de direitos
            de terceiros ou submissao de dados sem legitimidade.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-[#111111]">
            7. Privacidade e protecao de dados
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            O tratamento de dados pessoais segue a Politica de Privacidade,
            disponivel em{" "}
            <Link
              className="text-[#C2410C] hover:text-[#9A3412]"
              href="/privacidade"
            >
              /privacidade
            </Link>
            . Ao utilizar o servico, voce reconhece que o tratamento de dados e
            necessario para execucao do contrato e operacao legitima da
            plataforma.
          </p>
        </section>

        <section className="space-y-4 pb-8">
          <h2 className="text-xl font-semibold text-[#111111]">
            8. Foro, legislacao e alteracoes
          </h2>
          <p className="text-sm leading-6 text-[#44403C]">
            Estes termos sao regidos pelas leis da Republica Federativa do
            Brasil. Fica eleito o foro da comarca de Sao Paulo/SP, com renuncia
            a qualquer outro, salvo disposicao legal imperativa diversa. O
            EarlyCV pode atualizar estes termos a qualquer tempo, mediante
            publicacao da versao vigente nesta rota.
          </p>
        </section>
      </div>
    </main>
  );
}
