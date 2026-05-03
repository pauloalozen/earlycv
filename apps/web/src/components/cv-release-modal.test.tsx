import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CvReleaseModal } from "./cv-release-modal";

describe("CvReleaseModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders dialog semantics and loading state without close control", async () => {
    render(
      <CvReleaseModal
        open
        visible
        status="loading"
        canClose={false}
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload={false}
      />,
    );

    expect((await screen.findAllByText("Liberando seu CV...")).length).toBe(2);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby");
    expect(dialog).toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("button", { name: "Fechar aviso" })).toBeNull();
  });

  it("renders exact success message, one close control, and enabled CTAs", async () => {
    render(
      <CvReleaseModal
        open
        visible
        status="success"
        canClose
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload
      />,
    );

    expect(
      await screen.findByText(
        "Seu CV já está pronto para ser baixado. Não perca tempo: baixe o CV e candidate-se o mais rápido possível.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Fechar aviso" }),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Baixar em PDF" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Baixar em DOCX" }),
    ).toBeEnabled();
  });

  it("renders error message and keeps download buttons hidden", async () => {
    render(
      <CvReleaseModal
        open
        visible
        status="error"
        message="Falha ao liberar CV"
        canClose
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload={false}
      />,
    );

    expect((await screen.findAllByText("Falha ao liberar CV")).length).toBe(3);
    expect(screen.queryByRole("button", { name: "Baixar em PDF" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Baixar em DOCX" })).toBeNull();
  });

  it("calls onClose on Escape only when closable", async () => {
    const onClose = vi.fn();
    render(
      <CvReleaseModal
        open
        visible
        status="success"
        canClose
        onClose={onClose}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload
      />,
    );

    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanup();

    const onCloseBlocked = vi.fn();
    render(
      <CvReleaseModal
        open
        visible
        status="loading"
        canClose={false}
        onClose={onCloseBlocked}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload={false}
      />,
    );

    await screen.findAllByText("Liberando seu CV...");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseBlocked).not.toHaveBeenCalled();
  });

  it("does not expose dialog or controls when invisible", () => {
    render(
      <CvReleaseModal
        open
        visible={false}
        status="success"
        canClose
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Baixar em PDF" })).toBeNull();
  });

  it("disables download CTAs when download is unavailable", async () => {
    render(
      <CvReleaseModal
        open
        visible
        status="success"
        canClose
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading="pdf"
        canDownload={false}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Baixando PDF..." }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Baixar em DOCX" }),
    ).toBeDisabled();
  });

  it("moves focus into dialog, traps tab, and restores focus on close", async () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);
    outside.focus();

    const { rerender, unmount } = render(
      <CvReleaseModal
        open
        visible
        status="success"
        canClose
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload
      />,
    );

    const close = await screen.findByRole("button", { name: "Fechar aviso" });
    await waitFor(() => expect(close).toHaveFocus());

    close.focus();
    const docx = screen.getByRole("button", { name: "Baixar em DOCX" });
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(docx).toHaveFocus();

    rerender(
      <CvReleaseModal
        open={false}
        visible={false}
        status="success"
        canClose
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload
      />,
    );

    expect(outside).toHaveFocus();

    unmount();
    outside.remove();
  });

  it("announces status via aria-live region", async () => {
    const { rerender } = render(
      <CvReleaseModal
        open
        visible
        status="loading"
        canClose={false}
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload={false}
      />,
    );

    expect((await screen.findAllByText("Liberando seu CV...")).length).toBe(2);

    rerender(
      <CvReleaseModal
        open
        visible
        status="success"
        canClose
        onClose={() => {}}
        onDownloadPdf={() => {}}
        onDownloadDocx={() => {}}
        downloading={null}
        canDownload
      />,
    );

    const liveRegion = await screen.findByRole("status");
    expect(liveRegion).toHaveTextContent("CV liberado para download");
  });
});
