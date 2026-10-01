"use client";

import { useState, useTransition } from "react";

import { buttonVariants } from "@/app/admin/_components/admin-button";
import { AdminPill, AT } from "@/app/admin/_components/admin-primitives";
import type {
  EmailTemplateInfo,
  EmailTemplatePreview,
} from "@/lib/admin-emails-api";
import {
  previewEmailTemplateAction,
  resetEmailTemplateAction,
  saveEmailTemplateAction,
  sendTestEmailTemplateAction,
} from "../actions";

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid rgba(10,10,10,0.12)",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
  background: "#fafaf6",
};

type Message = { ok: boolean; text: string };

// Editor de UM template (assunto + corpo). Sem salvar, o admin pode
// pré-visualizar: as MESMAS regras do salvar (variáveis, uma pergunta no
// feedback, cupom nunca alega pagamento…) aparecem como erros antes de gravar.
// O rodapé de descadastro dos e-mails de relacionamento é acrescentado pelo
// sistema e não é editável. O pai usa key={template.key}: trocar de template
// reinicia este estado.
export function TemplateEditor({ template }: { template: EmailTemplateInfo }) {
  const [subject, setSubject] = useState(template.current.subject);
  const [body, setBody] = useState(template.current.body);
  const [preview, setPreview] = useState<EmailTemplatePreview | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [pending, startTransition] = useTransition();

  const dirty =
    subject !== template.current.subject || body !== template.current.body;

  function run(action: () => Promise<void>) {
    setMessage(null);
    startTransition(action);
  }

  const onPreview = () =>
    run(async () => {
      const result = await previewEmailTemplateAction(
        template.key,
        subject,
        body,
      );
      if (result.ok) setPreview(result.preview);
      else setMessage({ ok: false, text: result.message });
    });

  const onSave = () =>
    run(async () => {
      const result = await saveEmailTemplateAction(template.key, subject, body);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setPreview(null);
    });

  const onReset = () => {
    if (!window.confirm("Descartar a edição e voltar ao texto padrão?")) return;
    run(async () => {
      const result = await resetEmailTemplateAction(template.key);
      if (result.ok) {
        setSubject(template.defaults.subject);
        setBody(template.defaults.body);
        setPreview(null);
      }
      setMessage({ ok: result.ok, text: result.message });
    });
  };

  const onSendTest = () =>
    run(async () => {
      const result = await sendTestEmailTemplateAction(template.key, testEmail);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      const sent = result.result;
      if (!sent.sent) {
        setMessage({ ok: false, text: `Teste não enviado: ${sent.reason}` });
      } else if (sent.transport === "fake") {
        setMessage({
          ok: true,
          text: "Transporte fake (fora de produção): nada foi enviado pela rede.",
        });
      } else {
        setMessage({
          ok: sent.outcome === "SENT",
          text: `Teste enviado para ${testEmail} (${sent.outcome}). Usa o texto SALVO — salve antes de testar edições.`,
        });
      }
    });

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
          {template.label}
        </h2>
        {template.current.isCustom ? (
          <AdminPill tone="info">
            Personalizado · v{template.current.version}
          </AdminPill>
        ) : (
          <AdminPill tone="neutral">Texto padrão</AdminPill>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: AT.muted, margin: 0 }}>
        {template.description}
      </p>

      {message ? (
        <div
          role={message.ok ? "status" : "alert"}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 12.5,
            background: message.ok ? AT.okBg : AT.dangerBg,
            color: message.ok ? AT.ok : AT.danger,
            border: `1px solid ${message.ok ? "rgba(31,122,77,0.2)" : "rgba(155,44,44,0.2)"}`,
          }}
        >
          {message.text}
        </div>
      ) : null}

      <label
        style={{
          display: "grid",
          gap: 4,
          fontSize: 12,
          fontWeight: 600,
          color: AT.muted,
        }}
      >
        Assunto (texto fixo)
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          style={inputStyle}
        />
      </label>

      <label
        style={{
          display: "grid",
          gap: 4,
          fontSize: 12,
          fontWeight: 600,
          color: AT.muted,
        }}
      >
        Corpo (parágrafos separados por linha em branco)
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={14}
          style={{
            ...inputStyle,
            resize: "vertical",
            fontFamily: 'var(--font-geist-mono), "Geist Mono", monospace',
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        />
      </label>

      <div style={{ fontSize: 12, color: AT.muted }}>
        <strong>Variáveis:</strong>{" "}
        {template.variables.map((variable) => (
          <span
            key={variable.name}
            title={variable.description}
            style={{ marginRight: 10 }}
          >
            <code>{`{{${variable.name}}}`}</code>
          </span>
        ))}
        <br />
        {template.unsubscribeFooter
          ? "O rodapé com o link de descadastro é acrescentado automaticamente e não é editável."
          : "Recibo transacional: sem descadastro. O bloco {{resumo}} vem da compra aprovada, nunca de texto digitado."}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className={buttonVariants({ variant: "outline" })}
          onClick={onPreview}
          disabled={pending}
        >
          Pré-visualizar
        </button>
        <button
          type="button"
          className={buttonVariants()}
          onClick={onSave}
          disabled={pending || !dirty}
        >
          {pending ? "Aguarde..." : "Salvar"}
        </button>
        {template.current.isCustom ? (
          <button
            type="button"
            className={buttonVariants({ variant: "outline" })}
            onClick={onReset}
            disabled={pending}
          >
            Restaurar padrão
          </button>
        ) : null}
      </div>

      {preview ? (
        preview.errors.length > 0 ? (
          <ul
            role="alert"
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 12.5,
              color: AT.danger,
            }}
          >
            {preview.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : preview.rendered ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12.5 }}>
              <strong>Assunto:</strong> {preview.rendered.subject}
            </div>
            <iframe
              title="Pré-visualização do e-mail"
              sandbox=""
              srcDoc={preview.rendered.html}
              style={{
                width: "100%",
                height: 380,
                border: `1px solid ${AT.border}`,
                borderRadius: 8,
                background: "#fff",
              }}
            />
            <details>
              <summary
                style={{ fontSize: 12, color: AT.muted, cursor: "pointer" }}
              >
                Versão em texto
              </summary>
              <pre
                style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 6 }}
              >
                {preview.rendered.text}
              </pre>
            </details>
            <p style={{ fontSize: 11.5, color: AT.muted2, margin: 0 }}>
              Dados de exemplo (Maria Souza). O link de descadastro aparece como
              marcador: o SES o resolve no envio real.
            </p>
          </div>
        ) : null
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          paddingTop: 12,
          borderTop: `1px solid ${AT.border}`,
        }}
      >
        <input
          type="email"
          placeholder="E-mail do destinatário do teste (um só)"
          value={testEmail}
          onChange={(event) => setTestEmail(event.target.value)}
          style={{ ...inputStyle, maxWidth: 320 }}
        />
        <button
          type="button"
          className={buttonVariants({ variant: "outline" })}
          onClick={onSendTest}
          disabled={pending || dirty || !testEmail.trim()}
          title={
            dirty ? "Salve as alterações antes de enviar o teste" : undefined
          }
        >
          Enviar teste
        </button>
      </div>
    </div>
  );
}
