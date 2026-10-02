import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicFooter } from "@/components/public-footer";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  canAccessMockInterview,
  getMockInterviewMode,
  isMockInterviewPublic,
} from "@/lib/mock-interview-mode";
import {
  formatMockInterviewAmount,
  formatMockInterviewPrice,
  MOCK_INTERVIEW_OFFER as OFFER,
  toSchemaPrice,
} from "@/lib/mock-interview-offer";
import { fetchMockInterviewOffer } from "@/lib/mock-interview-offer.server";
import { getAbsoluteUrl } from "@/lib/site";
import { InterviewCallMock } from "../_landing/_interview-call-mock";
import { LandingNavV2 } from "../_landing/_nav-v2";
import { LandingScrollAnimations } from "../_landing-scroll-animations";
import { CheckoutLink } from "./_components/checkout-link";

const url = getAbsoluteUrl(OFFER.path);

const TITLE = "Entrevista Simulada ao Vivo com Feedback e Relatório | EarlyCV";
const BASE_DESCRIPTION =
  "Simulação de entrevista de emprego ao vivo pelo Google Meet: 45 minutos com um profissional com 20 anos de TI, perguntas baseadas na sua vaga e relatório formal com recomendações.";

function buildDescription(priceLabel: string | null) {
  return priceLabel
    ? `${BASE_DESCRIPTION} ${priceLabel} na oferta de lançamento.`
    : BASE_DESCRIPTION;
}

// Preço vem da API (PRICE_INTERVIEW_SIM); a página é regerada a cada 5 min.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const offer = await fetchMockInterviewOffer();
  return {
    ...STATIC_METADATA,
    // Fora de "on" a página só abre para staff: nunca indexar.
    ...(isMockInterviewPublic()
      ? {}
      : { robots: { follow: false, index: false } }),
    description: buildDescription(
      offer ? formatMockInterviewPrice(offer.amountInCents) : null,
    ),
  };
}

const STATIC_METADATA: Metadata = {
  title: { absolute: TITLE },
  keywords: [
    "entrevista simulada",
    "simulação de entrevista",
    "simulação de entrevista de emprego",
    "treino de entrevista",
    "mock interview",
    "entrevista técnica TI",
    "preparação para entrevista",
  ],
  alternates: { canonical: url },
  openGraph: {
    title: TITLE,
    description:
      "45 minutos ao vivo pelo Google Meet, perguntas baseadas na sua vaga e relatório formal com recomendações.",
    url,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "45 minutos ao vivo pelo Google Meet, perguntas baseadas na sua vaga e relatório formal com recomendações.",
  },
};

const SANS =
  'var(--font-ubuntu), -apple-system, "Segoe UI", system-ui, sans-serif';

const PROBLEMS = [
  "Você sabe fazer o trabalho, mas trava ao explicar o que fez.",
  "“Me fala de você” vira cinco minutos sem direção.",
  "A pergunta técnica chega e a resposta sai pela metade.",
  "No final, “tem alguma pergunta?” e você não tem nenhuma.",
] as const;

const STEPS = [
  {
    title: "Garanta sua sessão",
    body: "Pague com Pix ou cartão dentro da sua conta EarlyCV.",
  },
  {
    title: "Chame no WhatsApp",
    body: "Com o pagamento confirmado, o botão do WhatsApp aparece com o número do seu pedido.",
    tag: "liberado após o pagamento",
  },
  {
    title: "Combine o horário",
    body: "Você manda a vaga e escolhemos juntos o dia e a hora.",
  },
  {
    title: "Entrevista no Google Meet",
    body: "45 minutos ao vivo, no clima da entrevista real, com feedback na hora.",
  },
  {
    title: "Receba o relatório",
    body: "Depois da sessão, você recebe um relatório formal com as minhas recomendações.",
  },
] as const;

const SEGMENTS = [
  {
    range: "0–5 min",
    title: "Abertura",
    body: "A vaga, a empresa e o seu “me fala de você”.",
    weight: 5,
  },
  {
    range: "5–20 min",
    title: "Bloco técnico",
    body: "Perguntas da sua área e do seu nível, baseadas na vaga.",
    weight: 15,
  },
  {
    range: "20–35 min",
    title: "Bloco comportamental",
    body: "Conflitos, entregas, erros e decisões, com exemplos seus.",
    weight: 15,
  },
  {
    range: "35–45 min",
    title: "Feedback ao vivo",
    body: "O que funcionou, o que derrubaria você e o que ajustar.",
    weight: 10,
  },
] as const;

const COMPARE = [
  {
    label: "O que você recebe",
    free: "Perguntas prováveis e pontos para estudar",
    live: "Uma entrevista simulada completa, ao vivo",
  },
  {
    label: "Feedback",
    free: "Sobre o seu CV e a vaga",
    live: "Sobre como você responde, fala e conduz",
  },
  {
    label: "Relatório",
    free: "—",
    live: "Relatório formal com recomendações",
  },
  {
    label: "Pressão real",
    free: "Você lê no seu tempo",
    live: "Você responde na hora, como no dia",
  },
  {
    label: "Quando usar",
    free: "Assim que a vaga aparece",
    live: "Quando a entrevista já está marcada",
  },
] as const;

const INCLUDED = [
  "45 minutos ao vivo pelo Google Meet",
  "Perguntas baseadas na vaga que você vai disputar",
  "Blocos técnico e comportamental",
  "Feedback direto durante e no final da sessão",
  "Relatório formal com as minhas recomendações",
  "Horário combinado com você pelo WhatsApp",
] as const;

function buildFaq(priceLabel: string | null) {
  return [
    {
      q: "O que é uma entrevista simulada?",
      a: "É uma entrevista de treino que reproduz a entrevista real. Você responde perguntas técnicas e comportamentais baseadas na vaga que está disputando e recebe feedback sobre o que melhorar.",
    },
    ...(priceLabel
      ? [
          {
            q: "Quanto custa a entrevista simulada?",
            a: `${priceLabel} por sessão de ${OFFER.durationMinutes} minutos, na oferta de lançamento.`,
          },
        ]
      : []),
    {
      q: "Como a entrevista acontece?",
      a: "Pelo Google Meet, por vídeo. Depois que o horário é combinado no WhatsApp, você recebe o link da chamada.",
    },
    {
      q: "O que eu recebo depois da sessão?",
      a: "Um relatório formal com seus pontos fortes, o que ajustar nas respostas e as minhas recomendações para a entrevista real.",
    },
    {
      q: "Como eu agendo depois de pagar?",
      a: "Assim que o pagamento é confirmado, aparece um botão para falar comigo no WhatsApp, já com o número do seu pedido. Por lá combinamos dia e horário.",
    },
    {
      q: "Serve para entrevista técnica?",
      a: "Sim. A sessão tem um bloco técnico montado a partir da vaga e do seu nível.",
    },
    {
      q: "Posso pedir reembolso ou remarcar?",
      a: `O reembolso é integral até ${OFFER.refundHoursBefore} horas antes do horário agendado. A remarcação vale no mesmo prazo, com pelo menos ${OFFER.rescheduleHoursBefore} horas de antecedência. Se você não comparecer, o valor não é devolvido.`,
    },
    {
      q: "Preciso ter conta no EarlyCV?",
      a: "Sim. A compra fica registrada na sua conta, junto com o botão do WhatsApp. Criar a conta é grátis.",
    },
    {
      q: "Posso comprar mais de uma sessão?",
      a: "Pode. Você pode fazer uma sessão para cada etapa do processo ou para cada vaga importante.",
    },
  ];
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function Arrow() {
  return (
    <span className="si-arrow" aria-hidden="true">
      →
    </span>
  );
}

// Flag MOCK_INTERVIEW_MODE: "on" mantém a página estática; "admin" lê a
// sessão (página vira dinâmica) e só abre para staff; "off" é 404.
async function assertPageAvailable() {
  const mode = getMockInterviewMode();
  if (mode === "on") return;
  if (mode === "off") notFound();
  const user = await getCurrentAppUserFromCookies();
  if (!canAccessMockInterview(user, mode)) notFound();
}

export default async function SimulacaoDeEntrevistaPage() {
  await assertPageAvailable();
  const offer = await fetchMockInterviewOffer();
  const priceLabel = offer
    ? formatMockInterviewPrice(offer.amountInCents)
    : null;
  const priceAmount = offer
    ? formatMockInterviewAmount(offer.amountInCents)
    : null;
  const description = buildDescription(priceLabel);
  const FAQ = buildFaq(priceLabel);

  return (
    <main style={{ fontFamily: SANS, color: "#0a0a0a", background: "#ffffff" }}>
      <LandingScrollAnimations />
      <LandingNavV2 />

      {/* HERO */}
      <section className="si-hero">
        <div className="si-wrap si-hero-grid">
          <div>
            <div className="si-kicker">
              <span className="si-dot" />
              ENTREVISTA SIMULADA AO VIVO · GOOGLE MEET
            </div>
            <h1 className="si-h1">
              Você tem a experiência.{" "}
              <em className="si-serif">
                Treine como mostrar isso na entrevista.
              </em>
            </h1>
            <p className="si-lede">
              Uma entrevista simulada de {OFFER.durationMinutes} minutos, ao
              vivo, com quem está há 20 anos em TI. Você responde perguntas
              baseadas na sua vaga, recebe feedback na hora e, depois, um
              relatório formal com as minhas recomendações.
            </p>
            {priceAmount && (
              <div className="si-price">
                <span className="si-badge">{OFFER.offerLabel}</span>
                <span className="si-price-now">
                  <small>R$</small>
                  {priceAmount}
                </span>
              </div>
            )}
            <div className="si-cta-row">
              <CheckoutLink className="si-btn">
                Quero minha entrevista simulada <Arrow />
              </CheckoutLink>
              <a href="#como-funciona" className="si-btn-ghost">
                Como funciona
              </a>
            </div>
            <ul className="si-reassure">
              <li>Online pelo Google Meet</li>
              <li>Relatório formal depois da sessão</li>
              <li>Reembolso até {OFFER.refundHoursBefore}h antes</li>
            </ul>
          </div>

          <InterviewCallMock />
        </div>
      </section>

      {/* PROBLEMA */}
      <section className="si-block">
        <div className="si-wrap si-problem reveal-card">
          <blockquote>
            Muita vaga se perde na primeira vez em que a pessoa ouve certas
            perguntas. E essa primeira vez costuma ser na frente de quem decide.
          </blockquote>
          <ul>
            {PROBLEMS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="si-block" id="como-funciona">
        <div className="si-wrap">
          <div className="si-head reveal-card">
            <span className="si-label">COMO FUNCIONA</span>
            <h2>
              Do pagamento ao relatório em{" "}
              <em className="si-serif">cinco passos.</em>
            </h2>
            <p>
              Sem agenda automática nem robô. Você fala direto comigo para
              marcar o melhor horário.
            </p>
          </div>
          <ol className="si-steps reveal-card">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="si-step-n">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {"tag" in step ? (
                  <span className="si-step-tag">{step.tag}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* OS 45 MINUTOS */}
      <section className="si-block">
        <div className="si-wrap">
          <div className="si-head reveal-card">
            <span className="si-label">OS 45 MINUTOS</span>
            <h2>
              Como a sessão é <em className="si-serif">dividida.</em>
            </h2>
            <p>
              Estrutura de referência, ajustada à vaga e ao tipo de entrevista
              que você vai enfrentar.
            </p>
          </div>
          <div className="si-ruler reveal-card">
            <div className="si-ruler-bar" aria-hidden="true">
              {SEGMENTS.map((s) => (
                <span key={s.range} style={{ flexGrow: s.weight }} />
              ))}
            </div>
            <div className="si-ruler-parts">
              {SEGMENTS.map((s) => (
                <div key={s.range}>
                  <span className="si-ruler-t">{s.range}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
            <div className="si-ruler-after">
              <span className="si-ruler-t">Depois da sessão</span>
              <p>
                Você recebe o relatório formal com tudo o que conversamos e as
                minhas recomendações para a entrevista real.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* RELATÓRIO */}
      <section className="si-block">
        <div className="si-wrap si-report">
          <div className="si-head reveal-card" style={{ marginBottom: 0 }}>
            <span className="si-label">O QUE VOCÊ LEVA</span>
            <h2>
              Um relatório formal com as{" "}
              <em className="si-serif">minhas recomendações.</em>
            </h2>
            <p>
              O feedback ao vivo ajuda na hora. O relatório fica com você para
              revisar antes da entrevista real: o que já convence, o que ajustar
              e como ajustar.
            </p>
          </div>
          <article
            className="si-doc reveal-card"
            aria-label="Exemplo de relatório da entrevista simulada"
          >
            <header>
              <div>
                <span className="si-label">RELATÓRIO · EXEMPLO</span>
                <h3>Entrevista simulada</h3>
              </div>
              <dl>
                <dt>Vaga</dt>
                <dd>Analista de Dados Pleno</dd>
                <dt>Entrevistador</dt>
                <dd>Paulo Alozen</dd>
                <dt>Duração</dt>
                <dd>45 min</dd>
              </dl>
            </header>
            <section>
              <h4>Pontos fortes</h4>
              <ul>
                <li>Explicação técnica clara e objetiva sobre SQL.</li>
                <li>Boa conexão entre a sua experiência e a vaga.</li>
              </ul>
            </section>
            <section>
              <h4>O que ajustar</h4>
              <ul>
                <li>
                  Os exemplos param antes do resultado. Feche cada história com
                  o número que mudou.
                </li>
                <li>
                  Evitar conflito não é virtude na resposta comportamental.
                </li>
              </ul>
            </section>
            <section>
              <h4>Recomendações</h4>
              <ol>
                <li>
                  Reescreva 3 histórias no formato situação, ação, resultado.
                </li>
                <li>Prepare duas perguntas para o entrevistador.</li>
                <li>Treine o “me fala de você” em até 2 minutos.</li>
              </ol>
            </section>
          </article>
        </div>
      </section>

      {/* QUEM CONDUZ */}
      <section className="si-block" id="quem-conduz">
        <div className="si-wrap si-host reveal-card">
          <div className="si-portrait" aria-hidden="true">
            PA
          </div>
          <div>
            <span className="si-label">QUEM CONDUZ</span>
            <h2>
              Paulo Alozen, <em className="si-serif">20 anos de TI</em> e
              fundador do EarlyCV.
            </h2>
            <div className="si-bio">
              <p>
                Trabalho com tecnologia há 20 anos, em empresas e times
                diferentes, e vi de perto o que separa quem é chamado de quem
                fica pelo caminho.
              </p>
              <p>
                Na entrevista simulada eu faço perguntas baseadas na sua vaga e
                digo com franqueza onde a sua resposta convence e onde ela pode
                custar a vaga.
              </p>
            </div>
            <div className="si-facts">
              <div>
                <b>20</b>
                <span>anos em tecnologia</span>
              </div>
              <div>
                <b>45</b>
                <span>minutos ao vivo</span>
              </div>
              <div>
                <b>1</b>
                <span>relatório formal por sessão</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARAÇÃO */}
      <section className="si-block">
        <div className="si-wrap">
          <div className="si-head reveal-card">
            <span className="si-label">
              ENTREVISTA SIMULADA OU ROTEIRO POR IA
            </span>
            <h2>
              Os dois ajudam. Só um responde{" "}
              <em className="si-serif">de volta.</em>
            </h2>
            <p>
              O EarlyCV já gera um roteiro de preparação para cada vaga. A
              entrevista simulada é o passo seguinte: treinar em voz alta com
              uma pessoa.
            </p>
          </div>
          <div className="si-compare reveal-card">
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="si-visually-hidden">Critério</span>
                  </th>
                  <th scope="col" className="si-hl">
                    <span className="si-tag">
                      ao vivo{priceLabel ? ` · ${priceLabel}` : ""}
                    </span>
                    Entrevista simulada
                  </th>
                  <th scope="col">
                    <span className="si-tag">no Kit de Candidatura</span>
                    Roteiro de preparação
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className="si-hl">{row.live}</td>
                    <td>{row.free}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="si-compare-note">
            Ainda sem entrevista marcada? Comece pelo{" "}
            <Link href="/preparacao-para-entrevista">
              roteiro de preparação para entrevista
            </Link>
            .
          </p>
        </div>
      </section>

      {/* OFERTA */}
      <section className="si-block" id="oferta">
        <div className="si-wrap">
          <div className="si-offer reveal-card">
            <div className="si-offer-main">
              <span className="si-label si-label-dark">
                ENTREVISTA SIMULADA · ENSAIO GERAL
              </span>
              <h2>
                Uma sessão de 45 minutos, <em className="si-serif">ao vivo.</em>
              </h2>
              {priceAmount && (
                <>
                  <span className="si-badge si-badge-lime">
                    {OFFER.offerLabel}
                  </span>
                  <div className="si-offer-price">
                    <small>R$</small>
                    {priceAmount}
                  </div>
                </>
              )}
              <ul>
                {INCLUDED.map((item) => (
                  <li key={item}>
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
              <CheckoutLink className="si-btn si-btn-light">
                Garantir minha entrevista simulada <Arrow />
              </CheckoutLink>
              <p className="si-fine">
                Pagamento no EarlyCV com Pix ou cartão. Você pode comprar mais
                de uma sessão.
              </p>
            </div>
            <div className="si-policy">
              <h3>Regras claras, antes de pagar</h3>
              <div className="si-rule">
                <span className="si-rule-k">
                  {OFFER.refundHoursBefore}h<small>REEMBOLSO</small>
                </span>
                <div>
                  <h4>Reembolso integral</h4>
                  <p>
                    Peça até {OFFER.refundHoursBefore} horas antes do horário
                    agendado. Se ainda não marcou, pode pedir quando quiser.
                  </p>
                </div>
              </div>
              <div className="si-rule">
                <span className="si-rule-k">
                  {OFFER.rescheduleHoursBefore}h<small>REMARCAÇÃO</small>
                </span>
                <div>
                  <h4>Remarcação</h4>
                  <p>
                    Mude o horário com pelo menos {OFFER.rescheduleHoursBefore}{" "}
                    horas de antecedência, direto no WhatsApp.
                  </p>
                </div>
              </div>
              <div className="si-rule">
                <span className="si-rule-k">
                  0<small>NO-SHOW</small>
                </span>
                <div>
                  <h4>Ausência</h4>
                  <p>
                    Se você não aparecer no horário combinado, a sessão é
                    considerada realizada e o valor não é devolvido.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="si-block" id="faq">
        <div className="si-wrap si-faq">
          <div className="si-head" style={{ marginBottom: 0 }}>
            <span className="si-label">PERGUNTAS FREQUENTES</span>
            <h2>
              Antes de <em className="si-serif">agendar.</em>
            </h2>
          </div>
          <div className="si-faq-list">
            {FAQ.map((item, i) => (
              <details key={item.q} open={i === 0}>
                <summary>
                  {item.q}
                  <span className="si-pm" aria-hidden="true" />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="si-final">
        <div className="si-wrap reveal-card">
          <h2>
            Treine hoje. Na entrevista,{" "}
            <em className="si-serif">você já sabe o que dizer.</em>
          </h2>
          <p>
            {OFFER.durationMinutes} minutos ao vivo pelo Google Meet e relatório
            formal
            {priceLabel ? `, por ${priceLabel} na oferta de lançamento` : ""}.
          </p>
          <div className="si-cta-row">
            <CheckoutLink className="si-btn">
              Quero minha entrevista simulada <Arrow />
            </CheckoutLink>
          </div>
        </div>
      </section>

      <PublicFooter />

      <div className="si-mbar">
        <div>
          <span>{OFFER.offerLabel}</span>
          <b>{priceLabel ?? "Entrevista simulada"}</b>
        </div>
        <CheckoutLink className="si-btn">Agendar</CheckoutLink>
      </div>

      <style>{PAGE_CSS}</style>

      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static structured data
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Service",
                "@id": `${url}#servico`,
                name: "Entrevista simulada ao vivo",
                alternateName: "Ensaio Geral",
                serviceType: "Simulação de entrevista de emprego",
                description,
                url,
                areaServed: { "@type": "Country", name: "Brasil" },
                availableLanguage: "pt-BR",
                provider: {
                  "@type": "Organization",
                  name: "EarlyCV",
                  url: getAbsoluteUrl("/"),
                },
                ...(offer
                  ? {
                      offers: {
                        "@type": "Offer",
                        price: toSchemaPrice(offer.amountInCents),
                        priceCurrency: offer.currency,
                        availability: "https://schema.org/InStock",
                        url,
                      },
                    }
                  : {}),
              },
              {
                "@type": "FAQPage",
                mainEntity: FAQ.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: { "@type": "Answer", text: item.a },
                })),
              },
            ],
          }),
        }}
      />
    </main>
  );
}

const PAGE_CSS = `
.si-wrap { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 32px; box-sizing: border-box; }
.si-serif { font-family: var(--font-instrument-serif), serif; font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
.si-label { font-family: var(--font-ubuntu-mono), ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; font-weight: 400; letter-spacing: 1.4px; text-transform: uppercase; color: #8a8a85; }
.si-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.si-btn { background: #0a0a0a; color: #fff; border-radius: 10px; padding: 14px 22px; font-size: 14.6px; font-weight: 400; display: inline-flex; align-items: center; gap: 10px; letter-spacing: -0.1px; box-shadow: 0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08); white-space: nowrap; text-decoration: none; transition: transform .15s ease; }
.si-btn:hover { transform: translateY(-1px); }
.si-btn .si-arrow { transition: transform .15s ease; }
.si-btn:hover .si-arrow { transform: translateX(3px); }
.si-btn-ghost { color: #0a0a0a; font-size: 14px; padding: 14px; text-decoration: underline; text-decoration-color: rgba(10,10,10,0.2); text-underline-offset: 4px; }
.si-btn-light { background: #fff; color: #0a0a0a; justify-self: start; }
.si-badge { display: inline-block; align-self: flex-start; background: rgba(198,255,58,0.28); color: #405410; font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; }
.si-badge-lime { background: #c6ff3a; color: #0a0a0a; justify-self: start; }

.si-hero { padding: 136px 0 96px; }
.si-hero-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); gap: 56px; align-items: center; }
.si-kicker { display: inline-flex; align-items: center; gap: 10px; font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 11.5px; letter-spacing: 1.4px; color: #6a6a66; margin-bottom: 22px; }
.si-dot { width: 6px; height: 6px; border-radius: 50%; background: #c6ff3a; box-shadow: 0 0 6px #c6ff3a; flex-shrink: 0; }
.si-h1 { font-size: clamp(32px, 4.2vw, 50px); font-weight: 400; letter-spacing: -1.6px; line-height: 1.06; margin: 0 0 20px; text-wrap: balance; }
.si-lede { font-size: 17px; line-height: 1.55; font-weight: 300; color: #5c5a52; margin: 0; max-width: 540px; }
.si-price { display: flex; flex-direction: column; gap: 6px; margin-top: 28px; }
.si-price-now { font-size: 40px; font-weight: 500; letter-spacing: -1.4px; line-height: 1; font-variant-numeric: tabular-nums; }
.si-price-now small { font-size: 18px; font-weight: 400; margin-right: 3px; }
.si-cta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 26px; }
.si-reassure { list-style: none; margin: 18px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: #6a6a66; }
.si-reassure li::before { content: "✓"; margin-right: 6px; color: #405410; }

.si-block { padding: 96px 0; border-top: 1px solid rgba(10,10,10,0.07); }
.si-head { display: grid; gap: 14px; max-width: 720px; margin-bottom: 44px; }
.si-head h2, .si-host h2 { font-size: clamp(28px, 3.6vw, 42px); font-weight: 400; letter-spacing: -1.4px; line-height: 1.08; margin: 0; text-wrap: balance; }
.si-head p { font-size: 16.5px; line-height: 1.55; font-weight: 300; color: #5c5a52; margin: 0; max-width: 600px; }

.si-problem { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: start; }
.si-problem blockquote { margin: 0; font-family: var(--font-instrument-serif), serif; font-size: clamp(26px, 3.2vw, 38px); line-height: 1.18; }
.si-problem ul { list-style: none; margin: 0; padding: 0; }
.si-problem li { padding: 16px 0 16px 28px; border-bottom: 1px solid rgba(10,10,10,0.07); color: #3a3a38; font-weight: 300; position: relative; }
.si-problem li:first-child { border-top: 1px solid rgba(10,10,10,0.07); }
.si-problem li::before { content: ""; position: absolute; left: 0; top: 28px; width: 14px; height: 1.5px; background: #0a0a0a; }

.si-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border: 1px solid rgba(10,10,10,0.08); border-radius: 14px; overflow: hidden; background: #fafaf6; }
.si-steps li { padding: 24px 20px 26px; display: grid; gap: 10px; align-content: start; border-right: 1px solid rgba(10,10,10,0.08); }
.si-steps li:last-child { border-right: 0; }
.si-step-n { font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 12px; color: #8a8a85; }
.si-steps h3 { font-size: 17px; font-weight: 500; letter-spacing: -0.3px; margin: 0; }
.si-steps p { font-size: 14px; line-height: 1.5; font-weight: 300; color: #5c5a52; margin: 0; }
.si-step-tag { justify-self: start; font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 11px; color: #405410; background: rgba(198,255,58,0.28); padding: 3px 7px; border-radius: 4px; }

.si-ruler { background: #fafaf6; border: 1px solid rgba(10,10,10,0.08); border-radius: 14px; padding: 28px 24px 24px; }
.si-ruler-bar { display: flex; gap: 3px; height: 14px; }
.si-ruler-bar span { flex-basis: 0; border-radius: 3px; background: #0a0a0a; }
.si-ruler-bar span:nth-child(2) { opacity: .78; }
.si-ruler-bar span:nth-child(3) { opacity: .56; }
.si-ruler-bar span:nth-child(4) { background: #c6ff3a; }
.si-ruler-parts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; margin-top: 24px; }
.si-ruler-parts div { display: grid; gap: 6px; align-content: start; }
.si-ruler-t { font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 12px; color: #6a6a66; }
.si-ruler h3 { font-size: 16.5px; font-weight: 500; margin: 0; }
.si-ruler p { font-size: 14px; line-height: 1.5; font-weight: 300; color: #5c5a52; margin: 0; }
.si-ruler-after { margin-top: 24px; padding-top: 18px; border-top: 1px dashed #d8d6ce; display: grid; gap: 6px; }

.si-report { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 56px; align-items: center; }
.si-doc { background: #fff; border: 1px solid rgba(10,10,10,0.08); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(10,10,10,0.18); padding: 28px; display: grid; gap: 18px; }
.si-doc header { display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-bottom: 16px; border-bottom: 1px solid rgba(10,10,10,0.08); }
.si-doc h3 { font-family: var(--font-instrument-serif), serif; font-style: italic; font-weight: 400; font-size: 28px; margin: 6px 0 0; }
.si-doc dl { display: grid; grid-template-columns: auto auto; gap: 4px 14px; margin: 0; font-size: 13px; }
.si-doc dt { color: #8a8a85; }
.si-doc dd { margin: 0; color: #3a3a38; }
.si-doc section { display: grid; gap: 8px; }
.si-doc h4 { margin: 0; font-size: 13px; font-weight: 500; letter-spacing: .2px; }
.si-doc ul { list-style: disc; }
.si-doc ol { list-style: decimal; }
.si-doc ul, .si-doc ol { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: 14px; line-height: 1.5; font-weight: 300; color: #3a3a38; }

.si-host { display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); gap: 56px; align-items: center; }
.si-portrait { aspect-ratio: 4 / 5; max-width: 100%; border-radius: 18px; background: radial-gradient(120% 90% at 50% 30%, #2a2a26, #121210); color: #f4f3ee; display: grid; place-items: center; font-size: 64px; font-weight: 500; letter-spacing: -2px; }
.si-bio { display: grid; gap: 14px; margin-top: 18px; font-size: 16.5px; line-height: 1.6; font-weight: 300; color: #5c5a52; max-width: 600px; }
.si-bio p { margin: 0; }
.si-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 28px; border-top: 1px solid rgba(10,10,10,0.08); }
.si-facts div { padding: 18px 16px 0 0; display: grid; gap: 4px; }
.si-facts b { font-size: 34px; font-weight: 400; letter-spacing: -1.4px; line-height: 1; }
.si-facts span { font-size: 13px; color: #6a6a66; }

.si-compare { overflow-x: auto; border: 1px solid rgba(10,10,10,0.08); border-radius: 14px; }
.si-compare table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 15px; }
.si-compare th, .si-compare td { text-align: left; padding: 16px 20px; border-bottom: 1px solid rgba(10,10,10,0.07); vertical-align: top; font-weight: 300; }
.si-compare tr:last-child td { border-bottom: 0; }
.si-compare thead th { font-weight: 500; font-size: 14px; }
.si-compare thead th:first-child { width: 26%; }
.si-compare td:first-child { color: #6a6a66; font-size: 14px; }
.si-compare .si-hl { background: #fafaf6; color: #0a0a0a; }
.si-tag { display: block; font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 10.5px; color: #8a8a85; letter-spacing: 1px; text-transform: uppercase; font-weight: 400; margin-bottom: 4px; }
.si-compare-note { margin: 16px 0 0; font-size: 14px; color: #6a6a66; }
.si-compare-note a { color: #0a0a0a; text-decoration: underline; text-decoration-color: rgba(10,10,10,0.25); text-underline-offset: 4px; }

.si-offer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); border-radius: 18px; overflow: hidden; border: 1px solid rgba(10,10,10,0.08); box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(10,10,10,0.18); }
.si-offer-main { background: #0a0a0a; color: #fafaf6; padding: 40px; display: grid; gap: 18px; align-content: start; }
.si-label-dark { color: #9a9890; }
.si-offer-main h2 { font-size: clamp(28px, 3.2vw, 38px); font-weight: 400; letter-spacing: -1.2px; line-height: 1.08; margin: 0; }
.si-offer-price { font-size: 56px; font-weight: 500; letter-spacing: -2px; line-height: 1; font-variant-numeric: tabular-nums; }
.si-offer-price small { font-size: 22px; font-weight: 400; margin-right: 4px; }
.si-offer-main ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; font-size: 15px; font-weight: 300; }
.si-offer-main li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; }
.si-offer-main li svg { width: 16px; height: 16px; margin-top: 3px; fill: none; stroke: #c6ff3a; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.si-fine { margin: 0; font-size: 13px; color: #9a9890; }
.si-policy { background: #fafaf6; padding: 40px; display: grid; gap: 4px; align-content: start; }
.si-policy h3 { font-size: 20px; font-weight: 500; letter-spacing: -0.4px; margin: 0 0 12px; }
.si-rule { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 16px; padding: 16px 0; border-top: 1px solid rgba(10,10,10,0.08); }
.si-rule-k { font-family: var(--font-ubuntu-mono), ui-monospace, monospace; font-size: 22px; }
.si-rule-k small { display: block; font-size: 10.5px; color: #8a8a85; letter-spacing: 1px; margin-top: 2px; }
.si-rule h4 { margin: 0 0 4px; font-size: 15px; font-weight: 500; }
.si-rule p { margin: 0; font-size: 14px; line-height: 1.5; font-weight: 300; color: #5c5a52; }

.si-faq { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 56px; }
.si-faq-list { border-top: 1px solid rgba(10,10,10,0.08); }
.si-faq-list details { border-bottom: 1px solid rgba(10,10,10,0.08); }
.si-faq-list summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) 16px; gap: 16px; padding: 20px 0; font-size: 16.5px; font-weight: 500; letter-spacing: -0.2px; }
.si-faq-list summary::-webkit-details-marker { display: none; }
.si-pm { position: relative; width: 14px; height: 14px; margin-top: 5px; }
.si-pm::before, .si-pm::after { content: ""; position: absolute; left: 0; top: 6px; width: 14px; height: 1.6px; background: #0a0a0a; transition: transform .2s ease; }
.si-pm::after { transform: rotate(90deg); }
.si-faq-list details[open] .si-pm::after { transform: rotate(0deg); }
.si-faq-list details p { margin: 0; padding-bottom: 22px; font-size: 15.5px; line-height: 1.6; font-weight: 300; color: #5c5a52; max-width: 620px; }

.si-final { padding: 104px 0 120px; border-top: 1px solid rgba(10,10,10,0.07); }
.si-final h2 { font-size: clamp(34px, 5vw, 60px); font-weight: 400; letter-spacing: -2px; line-height: 1.02; margin: 0; max-width: 820px; text-wrap: balance; }
.si-final p { margin: 18px 0 0; font-size: 17px; font-weight: 300; color: #5c5a52; max-width: 560px; }

.si-mbar { display: none; }

@media (max-width: 960px) {
  .si-hero-grid, .si-report { grid-template-columns: minmax(0, 1fr); gap: 44px; }
  .si-hero-grid > .icm { max-width: 520px; }
  .si-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .si-steps li { border-bottom: 1px solid rgba(10,10,10,0.08); }
  .si-steps li:nth-child(2n) { border-right: 0; }
  .si-steps li:last-child { grid-column: 1 / -1; border-bottom: 0; }
}
@media (max-width: 820px) {
  .si-problem, .si-host, .si-faq, .si-offer { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  .si-offer { gap: 0; }
  .si-portrait { max-width: 180px; font-size: 44px; }
  .si-ruler-parts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .si-offer-main, .si-policy { padding: 28px 22px; }
}
@media (max-width: 640px) {
  .si-wrap { padding: 0 16px; }
  .si-hero { padding: 112px 0 72px; }
  .si-block { padding: 72px 0; }
  .si-steps { grid-template-columns: minmax(0, 1fr); }
  .si-steps li { border-right: 0; }
  .si-facts { grid-template-columns: minmax(0, 1fr); }
  .si-facts div { padding-bottom: 14px; border-bottom: 1px solid rgba(10,10,10,0.08); }
  .si-mbar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 15; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px)); background: #fff; border-top: 1px solid rgba(10,10,10,0.08); }
  .si-mbar > div { display: grid; line-height: 1.15; }
  .si-mbar span { font-size: 11px; color: #6a6a66; }
  .si-mbar b { font-size: 20px; font-weight: 500; }
  .si-mbar .si-btn { padding: 12px 18px; }
  .si-final { padding-bottom: 140px; }
}
`;
