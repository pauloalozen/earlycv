import assert from "node:assert/strict";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import { createFixture } from "./email-dispatch.fixtures";
import { createTable, type Row } from "./email-dispatch.test-support";
import { EmailDispatchTemplateService } from "./email-dispatch-template.service";
import {
  renderTemplate,
  TEMPLATE_DEFINITIONS,
  validateTemplate,
} from "./email-dispatch-templates";

// ---- Validação (as regras de conteúdo valem no salvar E no preview) --------

const ok = (
  key: Parameters<typeof validateTemplate>[0],
  subject: string,
  body: string,
) => validateTemplate(key, { subject, body });

test("the default text of every template is valid", () => {
  for (const key of Object.keys(TEMPLATE_DEFINITIONS) as Array<
    keyof typeof TEMPLATE_DEFINITIONS
  >) {
    assert.deepEqual(
      validateTemplate(key, TEMPLATE_DEFINITIONS[key].defaults),
      [],
      key,
    );
  }
});

test("common rules: subject/body required and bounded, subject is plain text, unknown variables and the SES placeholder are refused", () => {
  const base = TEMPLATE_DEFINITIONS.WELCOME.defaults;
  assert.ok(
    ok("WELCOME", "", base.body).some((e) => /assunto é obrigatório/.test(e)),
  );
  assert.ok(
    ok("WELCOME", "x".repeat(151), base.body).some((e) =>
      /passa de 150/.test(e),
    ),
  );
  assert.ok(
    ok("WELCOME", "a\nb", base.body).some((e) => /quebra de linha/.test(e)),
  );
  assert.ok(
    ok("WELCOME", "Oi {{nome}}", base.body).some((e) => /texto fixo/.test(e)),
  );
  assert.ok(
    ok("WELCOME", base.subject, "").some((e) => /corpo é obrigatório/.test(e)),
  );
  assert.ok(
    ok("WELCOME", base.subject, "x".repeat(5001)).some((e) =>
      /passa de 5000/.test(e),
    ),
  );
  assert.ok(
    ok("WELCOME", base.subject, "{{saudacao}} {{nmoe}}").some((e) =>
      /Variável desconhecida: \{\{nmoe\}\}/.test(e),
    ),
  );
  assert.ok(
    ok("WELCOME", base.subject, "oi {{amazonSESUnsubscribeUrl}}").some((e) =>
      /acrescentado pelo sistema/.test(e),
    ),
  );
});

test("feedback (first and second call): exactly ONE question, subject is not a question, no links", () => {
  const v = TEMPLATE_DEFINITIONS.FEEDBACK_FIRST_USE.defaults;
  assert.deepEqual(
    ok("FEEDBACK_FIRST_USE", v.subject, "{{saudacao}} O que achou?"),
    [],
  );
  assert.ok(
    ok("FEEDBACK_FIRST_USE", v.subject, "{{saudacao}} Gostou? Útil?").some(
      (e) => /exatamente uma pergunta.*tem 2/.test(e),
    ),
  );
  assert.ok(
    ok("FEEDBACK_FIRST_USE", v.subject, "{{saudacao}} Sem pergunta.").some(
      (e) => /exatamente uma pergunta.*tem 0/.test(e),
    ),
  );
  assert.ok(
    ok("FEEDBACK_FIRST_USE", "Gostou?", "{{saudacao}} O que achou?").some((e) =>
      /assunto do feedback não pode ser uma pergunta/.test(e),
    ),
  );
  assert.ok(
    ok("FEEDBACK_FIRST_USE", v.subject, "O que achou? https://x.com").some(
      (e) => /não leva links/.test(e),
    ),
  );

  // A segunda chamada tem as mesmas regras (uma pergunta, sem links) e pode
  // falar da análise: já não presume nada sobre ter visto o resultado.
  const second = TEMPLATE_DEFINITIONS.FEEDBACK_SECOND_CALL.defaults;
  assert.deepEqual(
    ok("FEEDBACK_SECOND_CALL", second.subject, "Como foi sua experiência?"),
    [],
  );
  assert.ok(
    ok("FEEDBACK_SECOND_CALL", second.subject, "Gostou? Útil?").some((e) =>
      /exatamente uma pergunta.*tem 2/.test(e),
    ),
  );
  assert.ok(
    ok("FEEDBACK_SECOND_CALL", second.subject, "Oi? https://x.com").some((e) =>
      /não leva links/.test(e),
    ),
  );
});

test("welcome: at most one link (literal URLs + {{link}})", () => {
  const w = TEMPLATE_DEFINITIONS.WELCOME.defaults;
  assert.ok(
    ok("WELCOME", w.subject, "{{link}} e https://x.com").some((e) =>
      /no máximo um link/.test(e),
    ),
  );
  assert.deepEqual(ok("WELCOME", w.subject, "Oi, {{nome}}. Veja {{link}}"), []);
});

test("paid receipt must inform plan, amount and credits ({{resumo}} or all three variables)", () => {
  const p = TEMPLATE_DEFINITIONS.PURCHASE_PAID.defaults;
  assert.ok(
    ok("PURCHASE_PAID", p.subject, "Obrigado pela compra.").some((e) =>
      /plano, valor e créditos/.test(e),
    ),
  );
  assert.ok(
    ok("PURCHASE_PAID", p.subject, "Plano {{plano}}, valor {{valor}}").some(
      (e) => /plano, valor e créditos/.test(e),
    ),
  );
  assert.deepEqual(
    ok(
      "PURCHASE_PAID",
      p.subject,
      "Plano {{plano}}, valor {{valor}}, créditos {{creditos}}",
    ),
    [],
  );
  assert.deepEqual(ok("PURCHASE_PAID", p.subject, "{{resumo}}"), []);
});

test("coupon redemption can NEVER claim payment: no value variable/text, no 'Valor pago', no 'recebemos o pagamento', no 'compra' in the subject", () => {
  const c = TEMPLATE_DEFINITIONS.PURCHASE_COUPON.defaults;
  for (const body of [
    "{{resumo}} Valor {{valor}}",
    "{{resumo}} Você pagou R$ 10",
    "{{resumo}} Valor pago: zero",
    "{{resumo}} Recebemos o pagamento!",
    "{{resumo}} Pagamento confirmado.",
  ]) {
    assert.ok(ok("PURCHASE_COUPON", c.subject, body).length > 0, body);
  }
  assert.ok(
    ok("PURCHASE_COUPON", "Confirmação da sua compra", c.body).some((e) =>
      /não pode falar em "compra"/.test(e),
    ),
  );
  assert.ok(
    ok("PURCHASE_COUPON", c.subject, "Cupom resgatado.").some((e) =>
      /plano e créditos/.test(e),
    ),
  );
  assert.deepEqual(ok("PURCHASE_COUPON", c.subject, "{{resumo}}"), []);
});

test("renderTemplate substitutes variables, splits paragraphs, escapes HTML and appends the unsubscribe footer ONLY for relationship templates", () => {
  const welcome = renderTemplate(
    "WELCOME",
    {
      subject: "  Oi  ",
      body: "{{saudacao}}\n\nLinha 1\nLinha 2 <b>{{nome}}</b>",
    },
    { saudacao: "Oi, Ana!", nome: "Ana" },
  );
  assert.equal(welcome.subject, "Oi");
  assert.ok(
    welcome.text.startsWith("Oi, Ana!\n\nLinha 1\nLinha 2 <b>Ana</b>\n\n—\n"),
  );
  assert.ok(welcome.text.includes("{{amazonSESUnsubscribeUrl}}"));
  assert.ok(welcome.html.includes("&lt;b&gt;Ana&lt;/b&gt;"));
  assert.ok(welcome.html.includes("<br />"));

  const receipt = renderTemplate(
    "PURCHASE_PAID",
    { subject: "s", body: "{{resumo}}" },
    { resumo: "x" },
  );
  assert.ok(!receipt.text.includes("amazonSES"));
  assert.ok(!receipt.html.includes("amazonSES"));

  // variável desconhecida nunca vaza "{{x}}" para o e-mail
  assert.equal(
    renderTemplate(
      "WELCOME",
      { subject: "s", body: "a {{x}} b" },
      {},
    ).text.startsWith("a  b"),
    true,
  );
});

// ---- Serviço (banco fake mínimo, com increment) -----------------------------

function templateDb() {
  const store = new Map<string, Row>();
  const monitorAdminActionLog = createTable();
  const emailDispatchTemplate = {
    findMany: async () => [...store.values()].map((r) => ({ ...r })),
    findUnique: async ({ where }: { where: { key: string } }) =>
      store.get(where.key) ?? null,
    create: async ({ data }: { data: Row }) => {
      const row = { version: 1, updatedAt: new Date(), ...data };
      store.set(data.key, row);
      return row;
    },
    update: async ({ where, data }: { where: { key: string }; data: Row }) => {
      const row = store.get(where.key);
      if (!row) throw new Error("not found");
      const { version, ...rest } = data;
      Object.assign(row, rest, {
        version: row.version + (version?.increment ?? 0),
        updatedAt: new Date(),
      });
      return { ...row };
    },
    deleteMany: async ({ where }: { where: { key: string } }) => {
      store.delete(where.key);
      return { count: 1 };
    },
  };
  const database = {
    emailDispatchTemplate,
    monitorAdminActionLog,
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;
  const service = new EmailDispatchTemplateService(database);
  return { service, store, monitorAdminActionLog };
}

test("without a saved edit the code default applies; saving replaces it, bumps the version and is audited", async () => {
  const { service, monitorAdminActionLog } = templateDb();

  const before = await service.getEffective("WELCOME");
  assert.equal(before.isCustom, false);
  assert.equal(before.subject, "Boas-vindas ao EarlyCV");

  const saved = await service.update("admin_1", "WELCOME", {
    subject: "Bem-vindo(a)!",
    body: "{{saudacao}} Seja bem-vindo. {{link}}",
  });
  assert.equal(saved.version, 1);
  const effective = await service.getEffective("WELCOME");
  assert.equal(effective.isCustom, true);
  assert.equal(effective.subject, "Bem-vindo(a)!");

  const again = await service.update("admin_1", "WELCOME", {
    subject: "Novo",
    body: "{{saudacao}} {{link}}",
  });
  assert.equal(again.version, 2);
  assert.equal(monitorAdminActionLog.rows.length, 2);
  assert.equal(
    monitorAdminActionLog.rows[0].action,
    "email_dispatch_template_updated",
  );
  assert.equal(monitorAdminActionLog.rows[0].entityId, "WELCOME");
});

test("an invalid template is rejected with all the reasons and nothing is saved", async () => {
  const { service, store } = templateDb();

  await assert.rejects(
    () =>
      service.update("a", "FEEDBACK_FIRST_USE", {
        subject: "Gostou?",
        body: "Útil? Mesmo?",
      }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(error.message, /exatamente uma pergunta/);
      assert.match(
        error.message,
        /assunto do feedback não pode ser uma pergunta/,
      );
      return true;
    },
  );
  assert.equal(store.size, 0);
});

test("reset deletes the edit and returns to the code default (audited)", async () => {
  const { service, store, monitorAdminActionLog } = templateDb();
  await service.update("a", "WELCOME", {
    subject: "X",
    body: "{{saudacao}} {{link}}",
  });

  const reset = await service.reset("a", "WELCOME");

  assert.equal(store.size, 0);
  assert.equal(reset.isCustom, false);
  assert.equal(
    (await service.getEffective("WELCOME")).subject,
    "Boas-vindas ao EarlyCV",
  );
  assert.equal(
    monitorAdminActionLog.rows.at(-1)?.action,
    "email_dispatch_template_reset",
  );
});

test("preview validates AND renders with sample data without saving; invalid content returns the errors and no render", async () => {
  const { service, store } = templateDb();

  const good = service.preview(
    "PURCHASE_PAID",
    TEMPLATE_DEFINITIONS.PURCHASE_PAID.defaults,
  );
  assert.deepEqual(good.errors, []);
  assert.match(good.rendered?.text ?? "", /Valor pago: R\$\s?49,90/);
  assert.match(good.rendered?.text ?? "", /Oi, Maria!/);

  const coupon = service.preview(
    "PURCHASE_COUPON",
    TEMPLATE_DEFINITIONS.PURCHASE_COUPON.defaults,
  );
  assert.doesNotMatch(coupon.rendered?.text ?? "", /Valor pago|R\$/);

  const bad = service.preview("PURCHASE_PAID", {
    subject: "s",
    body: "sem resumo",
  });
  assert.ok(bad.errors.length > 0);
  assert.equal(bad.rendered, null);
  assert.equal(store.size, 0);
});

test("a template read error falls back to the code defaults (it must never block a send) and is logged", async () => {
  const database = {
    emailDispatchTemplate: {
      findMany: async () => {
        throw new Error("db down");
      },
    },
    // biome-ignore lint/suspicious/noExplicitAny: fake mínimo pro teste
  } as any;
  const service = new EmailDispatchTemplateService(database);
  const lines: string[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: logger privado no teste
  (service as any).logger = { error: (m: string) => lines.push(m) };

  const effective = await service.getEffective("FEEDBACK_SECOND_CALL");

  assert.equal(effective.isCustom, false);
  assert.equal(effective.subject, "Sua primeira experiência no EarlyCV");
  assert.match(
    lines[0],
    /^email_dispatch_templates_unreadable action=use_defaults reason=db down$/,
  );
});

// ---- Uso real no envio ---------------------------------------------------------

test("the SAVED template is what gets sent (subject + body), through the real dispatch service", async () => {
  const f = createFixture({
    env: { EMAIL_WELCOME_MODE: "LIVE" },
    production: true,
  });
  await f.emailDispatchTemplate.create({
    data: {
      key: "WELCOME",
      subject: "Assunto editado no admin",
      body: "{{saudacao}}\n\nTexto editado. Comece aqui: {{link}}",
      version: 1,
    },
  });

  await f.service.deliver({
    dispatchId: "d1",
    kind: "WELCOME",
    to: "maria@example.com",
    name: "Maria Souza",
    realTransport: true,
  });

  const { message } = f.sent[0];
  assert.equal(message.subject, "Assunto editado no admin");
  assert.match(
    message.text,
    /^Oi, Maria!\n\nTexto editado\. Comece aqui: https?:\/\/\S+\/adaptar/,
  );
  assert.ok(message.text.includes("{{amazonSESUnsubscribeUrl}}")); // rodapé continua do sistema
  assert.ok(message.html.includes("{{amazonSESUnsubscribeUrl}}"));
});
