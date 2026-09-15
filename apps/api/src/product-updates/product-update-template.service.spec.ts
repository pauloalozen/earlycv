import assert from "node:assert/strict";
import { test } from "node:test";

import { ProductUpdateTemplateService } from "./product-update-template.service";

const BASE_CONTENT = {
  subject: "Nova função no EarlyCV",
  preheader: "Confira o que mudou",
  content: "Primeiro parágrafo.\n\nSegundo parágrafo.",
};

test("ProductUpdateTemplateService greets by first name when provided, generic otherwise", () => {
  const service = new ProductUpdateTemplateService();

  const withName = service.render(BASE_CONTENT, {
    recipientName: "Maria Silva",
    mode: "real",
  });
  assert.match(withName.html, /Olá, Maria,/);
  assert.match(withName.text, /Olá, Maria,/);

  const withoutName = service.render(BASE_CONTENT, {
    recipientName: null,
    mode: "real",
  });
  assert.match(withoutName.html, /Olá,<\/p>|>Olá,</);
  assert.doesNotMatch(withoutName.html, /Olá, Maria/);
});

test("ProductUpdateTemplateService omits the primary button when text or url is missing", () => {
  const service = new ProductUpdateTemplateService();

  const withoutButton = service.render(BASE_CONTENT, {
    recipientName: null,
    mode: "real",
  });
  assert.doesNotMatch(withoutButton.html, /background:#0a0a0a;color:#fafaf6/);

  const withButton = service.render(
    {
      ...BASE_CONTENT,
      primaryButtonText: "Ver novidade",
      primaryButtonUrl: "https://earlycv.com.br/x",
    },
    { recipientName: null, mode: "real" },
  );
  assert.match(withButton.html, /Ver novidade/);
  assert.match(withButton.html, /https:\/\/earlycv\.com\.br\/x/);
  assert.match(withButton.text, /Ver novidade: https:\/\/earlycv\.com\.br\/x/);
});

test("ProductUpdateTemplateService uses the SES unsubscribe placeholder only in real mode, never in test mode", () => {
  const service = new ProductUpdateTemplateService();

  const real = service.render(BASE_CONTENT, {
    recipientName: null,
    mode: "real",
  });
  assert.match(real.html, /\{\{amazonSESUnsubscribeUrl\}\}/);
  assert.match(real.text, /\{\{amazonSESUnsubscribeUrl\}\}/);

  const test_ = service.render(BASE_CONTENT, {
    recipientName: null,
    mode: "test",
  });
  assert.doesNotMatch(test_.html, /\{\{amazonSESUnsubscribeUrl\}\}/);
  assert.doesNotMatch(test_.text, /\{\{amazonSESUnsubscribeUrl\}\}/);
  assert.match(test_.html, /omitido em envios de teste/);
});

test("ProductUpdateTemplateService escapes HTML in every user-provided field — admin content is never trusted as HTML", () => {
  const service = new ProductUpdateTemplateService();

  const rendered = service.render(
    {
      subject: "<script>alert(1)</script>",
      content: "<img src=x onerror=alert(1)>",
      optionalFooterContent: "<b>rodapé</b>",
    },
    { recipientName: "<b>Nome</b>", mode: "real" },
  );

  assert.doesNotMatch(rendered.html, /<script>/);
  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.doesNotMatch(rendered.html, /<b>rodapé<\/b>/);
});

test("ProductUpdateTemplateService renders the preheader as a hidden preview element, not visible body text", () => {
  const service = new ProductUpdateTemplateService();
  const rendered = service.render(BASE_CONTENT, {
    recipientName: null,
    mode: "real",
  });
  assert.match(rendered.html, /display:none/);
  assert.match(rendered.html, /Confira o que mudou/);
});
