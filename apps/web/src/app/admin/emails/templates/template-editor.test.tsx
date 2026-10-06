import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sob carga (suíte inteira em paralelo) o padrão de 1s é curto para as
// transições assíncronas do React 19.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

const actions = vi.hoisted(() => ({
  previewEmailTemplateAction: vi.fn(),
  saveEmailTemplateAction: vi.fn(),
  resetEmailTemplateAction: vi.fn(),
  sendTestEmailTemplateAction: vi.fn(),
}));
vi.mock("../actions", () => actions);

import type { EmailTemplateInfo } from "@/lib/admin-emails-api";
import { TemplateEditor } from "./template-editor";

const template = (
  overrides: Partial<EmailTemplateInfo["current"]> = {},
): EmailTemplateInfo => ({
  key: "FEEDBACK_FIRST_USE",
  label: "Feedback",
  description: "Enviado 24h após o cadastro.",
  variables: [
    { name: "saudacao", description: "Saudação pronta" },
    { name: "nome", description: "Primeiro nome" },
  ],
  unsubscribeFooter: true,
  defaults: { subject: "Sobre a análise", body: "{{saudacao}} O que achou?" },
  current: {
    key: "FEEDBACK_FIRST_USE",
    subject: "Sobre a análise",
    body: "{{saudacao}} O que achou?",
    isCustom: false,
    version: 0,
    updatedAt: null,
    updatedByAdminId: null,
    ...overrides,
  },
});

describe("TemplateEditor", () => {
  beforeEach(() => {
    for (const fn of Object.values(actions)) fn.mockReset();
  });

  it("shows label, status, variables and the non-editable footer notice", () => {
    render(<TemplateEditor template={template()} />);

    expect(
      screen.getByRole("heading", { name: "Feedback" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Texto padrão")).toBeInTheDocument();
    expect(screen.getByText("{{saudacao}}")).toBeInTheDocument();
    expect(
      screen.getByText(
        /rodapé com o link de descadastro é acrescentado automaticamente/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Sobre a análise")).toBeInTheDocument();
  });

  it("a customised template shows its version and offers 'Restaurar padrão'; a default one does not", () => {
    const { unmount } = render(
      <TemplateEditor template={template({ isCustom: true, version: 3 })} />,
    );
    expect(screen.getByText("Personalizado · v3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restaurar padrão" }),
    ).toBeInTheDocument();
    unmount();

    render(<TemplateEditor template={template()} />);
    expect(
      screen.queryByRole("button", { name: "Restaurar padrão" }),
    ).not.toBeInTheDocument();
  });

  it("Save is disabled until something changes; saving calls the action with the typed subject/body and reports the result", async () => {
    actions.saveEmailTemplateAction.mockResolvedValue({
      ok: true,
      message: "Template salvo.",
    });
    render(<TemplateEditor template={template()} />);
    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Sobre a análise"), {
      target: { value: "Novo assunto" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(actions.saveEmailTemplateAction).toHaveBeenCalledWith(
        "FEEDBACK_FIRST_USE",
        "Novo assunto",
        "{{saudacao}} O que achou?",
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Template salvo.",
    );
  });

  it("a rule violation from the backend is shown as an alert", async () => {
    actions.saveEmailTemplateAction.mockResolvedValue({
      ok: false,
      message: "Variável desconhecida: {{nmoe}}",
    });
    render(<TemplateEditor template={template()} />);

    fireEvent.change(screen.getByDisplayValue("Sobre a análise"), {
      target: { value: "Outro" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Variável desconhecida/,
    );
  });

  it("preview shows validation errors BEFORE saving, or the rendered e-mail (subject + sandboxed HTML + text) when valid", async () => {
    actions.previewEmailTemplateAction.mockResolvedValueOnce({
      ok: true,
      preview: { errors: ["O corpo é obrigatório."], rendered: null },
    });
    render(<TemplateEditor template={template()} />);

    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));
    expect(
      await screen.findByText("O corpo é obrigatório."),
    ).toBeInTheDocument();

    actions.previewEmailTemplateAction.mockResolvedValueOnce({
      ok: true,
      preview: {
        errors: [],
        rendered: {
          subject: "Assunto final",
          html: "<p>Oi, Maria!</p>",
          text: "Oi, Maria!",
        },
      },
    });
    // a transição anterior termina antes de o botão voltar a aceitar clique
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Pré-visualizar" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar" }));

    expect(await screen.findByText("Assunto final")).toBeInTheDocument();
    const frame = screen.getByTitle("Pré-visualização do e-mail");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", "<p>Oi, Maria!</p>");
  });

  it("reset asks for confirmation, restores the default text and reports success", async () => {
    actions.resetEmailTemplateAction.mockResolvedValue({
      ok: true,
      message: "Template restaurado para o texto padrão.",
    });
    const confirm = vi.spyOn(window, "confirm");
    render(
      <TemplateEditor
        template={{
          ...template({
            isCustom: true,
            version: 2,
            subject: "Editado",
            body: "{{saudacao}} Editado?",
          }),
        }}
      />,
    );

    confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    expect(actions.resetEmailTemplateAction).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));
    await waitFor(() =>
      expect(actions.resetEmailTemplateAction).toHaveBeenCalledWith(
        "FEEDBACK_FIRST_USE",
      ),
    );
    expect(
      await screen.findByDisplayValue("Sobre a análise"),
    ).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("send-test needs ONE e-mail and saved content (disabled while there are unsaved edits); fake transport says nothing was sent", async () => {
    actions.sendTestEmailTemplateAction.mockResolvedValue({
      ok: true,
      result: {
        transport: "fake",
        sent: true,
        outcome: "SENT",
        dispatchId: "d1",
      },
    });
    render(<TemplateEditor template={template()} />);
    const send = screen.getByRole("button", { name: "Enviar teste" });
    expect(send).toBeDisabled(); // sem e-mail

    fireEvent.change(
      screen.getByPlaceholderText(/E-mail do destinatário do teste/),
      {
        target: { value: "paulo.alozen@gmail.com" },
      },
    );
    expect(send).toBeEnabled();

    fireEvent.change(screen.getByDisplayValue("Sobre a análise"), {
      target: { value: "Editado agora" },
    });
    expect(send).toBeDisabled(); // edição não salva
    fireEvent.change(screen.getByDisplayValue("Editado agora"), {
      target: { value: "Sobre a análise" },
    });
    expect(send).toBeEnabled();

    fireEvent.click(send);

    await waitFor(() =>
      expect(actions.sendTestEmailTemplateAction).toHaveBeenCalledWith(
        "FEEDBACK_FIRST_USE",
        "paulo.alozen@gmail.com",
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Transporte fake .* nada foi enviado pela rede/,
    );
  });

  it("send-test reports a real send and a refusal reason", async () => {
    render(<TemplateEditor template={template()} />);
    fireEvent.change(
      screen.getByPlaceholderText(/E-mail do destinatário do teste/),
      {
        target: { value: "paulo.alozen@gmail.com" },
      },
    );

    actions.sendTestEmailTemplateAction.mockResolvedValueOnce({
      ok: true,
      result: {
        transport: "real",
        sent: true,
        outcome: "SENT",
        dispatchId: "d1",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar teste" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Teste enviado para paulo\.alozen@gmail\.com\./,
    );

    // a transição anterior termina antes de o botão voltar a aceitar clique
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Enviar teste" }),
      ).toBeEnabled(),
    );
    actions.sendTestEmailTemplateAction.mockResolvedValueOnce({
      ok: true,
      result: {
        transport: "real",
        sent: false,
        reason: "not_ready:ses_disabled",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar teste" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Teste não enviado: not_ready:ses_disabled/,
    );
  });

  it("send-test shows the provider error when the real send fails", async () => {
    render(<TemplateEditor template={template()} />);
    fireEvent.change(
      screen.getByPlaceholderText(/E-mail do destinatário do teste/),
      { target: { value: "paulo.alozen@gmail.com" } },
    );
    actions.sendTestEmailTemplateAction.mockResolvedValueOnce({
      ok: true,
      result: {
        transport: "real",
        sent: true,
        outcome: "FAILED",
        dispatchId: "d1",
        errorCode: "NotFoundException",
        errorMessage: "List does not exist",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar teste" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /NÃO enviado .*FAILED.*NotFoundException: List does not exist/,
    );
  });
});
