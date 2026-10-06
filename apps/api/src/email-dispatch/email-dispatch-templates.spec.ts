import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatMoney,
  type PurchaseConfirmationPayload,
  renderFeedbackEmail,
  renderPurchaseConfirmationEmail,
  renderWelcomeEmail,
  SES_UNSUBSCRIBE_PLACEHOLDER,
} from "./email-dispatch-templates";

test("welcome: greets by first name, one CTA link to /adaptar, SES unsubscribe placeholder, signed by Paulo", () => {
  const email = renderWelcomeEmail({
    name: "Maria Souza",
    appUrl: "https://earlycv.com.br/",
  });

  assert.equal(email.subject, "Boas-vindas ao EarlyCV");
  assert.match(email.text, /^Oi, Maria!/);
  assert.match(email.text, /Aqui é o Paulo, fundador do EarlyCV/);
  assert.ok(email.text.includes("https://earlycv.com.br/adaptar"));
  assert.ok(email.text.includes(SES_UNSUBSCRIBE_PLACEHOLDER));
  assert.ok(email.html.includes(`href="${SES_UNSUBSCRIBE_PLACEHOLDER}"`));

  // Um único link de ação + o de descadastro (placeholder).
  const links = email.text.match(/https?:\/\/\S+/g) ?? [];
  assert.equal(links.length, 1);
});

test("welcome: falls back to a nameless greeting when the name is empty", () => {
  assert.match(
    renderWelcomeEmail({ name: "  ", appUrl: "https://x.com" }).text,
    /^Oi!/,
  );
  assert.match(
    renderWelcomeEmail({ name: null, appUrl: "https://x.com" }).text,
    /^Oi!/,
  );
});

test("feedback (first): exactly one question, the single agreed wording, subject is not a question, no links", () => {
  const email = renderFeedbackEmail({
    name: "Ana",
    kind: "FEEDBACK_FIRST_USE",
  });

  assert.equal(email.subject, "Sobre a análise do seu currículo");
  assert.match(email.text, /O que você achou da análise do seu currículo\?/);
  assert.equal((email.text.match(/\?/g) ?? []).length, 1);
  assert.doesNotMatch(email.subject, /\?/);
  assert.equal((email.text.match(/https?:\/\//g) ?? []).length, 0);
});

test("feedback second call: exactly one question, no links, own wording", () => {
  const email = renderFeedbackEmail({
    name: "Ana",
    kind: "FEEDBACK_SECOND_CALL",
  });

  assert.equal(email.subject, "Sua primeira experiência no EarlyCV");
  assert.match(email.text, /Como foi sua primeira experiência com o EarlyCV\?/);
  assert.equal((email.text.match(/\?/g) ?? []).length, 1);
  assert.doesNotMatch(email.subject, /\?/);
  assert.equal((email.text.match(/https?:\/\//g) ?? []).length, 0);
});

test("feedback: invites a plain reply, signed by Paulo, with the unsubscribe placeholder, no banner/image", () => {
  for (const kind of ["FEEDBACK_FIRST_USE", "FEEDBACK_SECOND_CALL"] as const) {
    const email = renderFeedbackEmail({ name: "Ana", kind });
    assert.match(email.text, /Responda este e-mail/);
    assert.match(email.text, /Paulo\nEarlyCV/);
    assert.ok(email.text.includes(SES_UNSUBSCRIBE_PLACEHOLDER));
    assert.doesNotMatch(email.html, /<img/i);
  }
});

test("html escapes the recipient name", () => {
  const email = renderFeedbackEmail({
    name: `<script>alert(1)</script>`,
    kind: "FEEDBACK_FIRST_USE",
  });
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
});

// ---- Confirmação de compra ----------------------------------------------

const PAID: PurchaseConfirmationPayload = {
  planType: "pro",
  amountInCents: 4990,
  currency: "BRL",
  credits: 5,
  analysisCredits: 5,
  isUnlimited: false,
  isCouponRedemption: false,
};

const render = (payload: PurchaseConfirmationPayload) =>
  renderPurchaseConfirmationEmail({
    name: "Maria Souza",
    appUrl: "https://earlycv.com.br",
    payload,
  });

test("purchase (paid): states plan, amount paid and credits added, and says payment was received", () => {
  const email = render(PAID);

  assert.equal(email.subject, "Confirmação da sua compra no EarlyCV");
  assert.match(email.text, /^Oi, Maria!/);
  assert.match(email.text, /Recebemos o pagamento da sua compra/);
  assert.match(email.text, /Plano: Pro/);
  assert.match(email.text, /Valor pago: R\$\s?49,90/);
  assert.match(
    email.text,
    /Créditos adicionados: 5 CVs otimizados e 5 análises/,
  );
  assert.ok(email.text.includes("https://earlycv.com.br/dashboard"));
  // transacional: nunca tem descadastro nem placeholder SES
  assert.doesNotMatch(email.text, /amazonSES|cancele aqui/i);
  assert.doesNotMatch(email.html, /amazonSES|cancelar/i);
});

test("purchase (100% coupon): says the coupon was redeemed and NEVER claims payment or shows a paid amount", () => {
  const email = render({ ...PAID, amountInCents: 0, isCouponRedemption: true });

  assert.equal(email.subject, "Seu cupom foi resgatado no EarlyCV");
  assert.match(
    email.text,
    /Seu cupom foi resgatado com sucesso\. Nenhum pagamento foi cobrado\./,
  );
  assert.doesNotMatch(email.text, /Recebemos o pagamento/);
  assert.doesNotMatch(email.text, /Valor pago/);
  assert.doesNotMatch(email.text, /R\$/);
  assert.doesNotMatch(email.subject, /compra/i);
  assert.match(
    email.text,
    /Créditos adicionados: 5 CVs otimizados e 5 análises/,
  );
});

test("purchase: singular/plural, no analysis line when none, unlimited plan has no credit numbers", () => {
  const single = render({ ...PAID, credits: 1, analysisCredits: 1 });
  assert.match(single.text, /1 CV otimizado e 1 análise/);

  const noAnalysis = render({ ...PAID, analysisCredits: 0 });
  assert.match(noAnalysis.text, /Créditos adicionados: 5 CVs otimizados\n/);
  assert.doesNotMatch(noAnalysis.text, /análise/);

  const unlimited = render({
    ...PAID,
    planType: "unlimited",
    isUnlimited: true,
    credits: 0,
    analysisCredits: 0,
  });
  assert.match(unlimited.text, /Plano: Ilimitado/);
  assert.match(unlimited.text, /Acesso: ilimitado/);
  assert.doesNotMatch(unlimited.text, /Créditos adicionados/);
});

test("purchase: uses the purchase's own currency and escapes the name in HTML", () => {
  assert.match(formatMoney(1250, "BRL"), /R\$\s?12,50/);
  assert.match(formatMoney(1250, "USD"), /US\$\s?12,50/);
  assert.equal(formatMoney(1250, "???"), "12.50 ???");

  const html = renderPurchaseConfirmationEmail({
    name: "<b>x</b>",
    appUrl: "https://x.com",
    payload: PAID,
  }).html;
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

// A AWS substitui {{amazonSESUnsubscribeUrl}} em HTML e em TEXT (docs: "Placeholder
// replacement is supported only for HTML and TEXT content types"), no máximo 2
// ocorrências por conteúdo, e só quando ListManagementOptions está presente.
test("relationship e-mails carry the SES unsubscribe placeholder in BOTH text and HTML (1 each, max allowed is 2); transactional e-mails carry none", () => {
  const count = (value: string) =>
    value.split(SES_UNSUBSCRIBE_PLACEHOLDER).length - 1;

  for (const email of [
    renderWelcomeEmail({ name: "Ana", appUrl: "https://x.com" }),
    renderFeedbackEmail({ name: "Ana", kind: "FEEDBACK_FIRST_USE" }),
    renderFeedbackEmail({ name: "Ana", kind: "FEEDBACK_SECOND_CALL" }),
  ]) {
    assert.equal(count(email.text), 1);
    assert.equal(count(email.html), 1);
    assert.match(email.html, /<a href="\{\{amazonSESUnsubscribeUrl\}\}"/);
  }

  const receipt = renderPurchaseConfirmationEmail({
    name: "Ana",
    appUrl: "https://x.com",
    payload: PAID,
  });
  assert.equal(count(receipt.text), 0);
  assert.equal(count(receipt.html), 0);
});
