import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ResumeTemplateDocxService } from "./resume-template-docx.service";

class TestResumeTemplateDocxService extends ResumeTemplateDocxService {
  public readonly attempted: string[] = [];

  constructor(
    private readonly behavior: (
      binary: string,
      args: string[],
    ) => Promise<void>,
  ) {
    super({} as never);
  }

  protected override async runExecFile(
    binary: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    this.attempted.push(binary);
    await this.behavior(binary, args);
    return { stdout: "", stderr: "" };
  }
}

describe("ResumeTemplateDocxService libreoffice lookup", () => {
  it("tries next binary when ENOENT", async () => {
    const service = new TestResumeTemplateDocxService(async (binary) => {
      if (binary === "soffice") {
        const err = new Error("spawn soffice ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      }
      if (binary === "libreoffice") {
        return;
      }
      const err = new Error("should not reach extra fallback") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    await (service as unknown as { execLibreOfficeConvert(path: string): Promise<void> }).execLibreOfficeConvert(
      "/tmp/test.docx",
    );

    assert.deepEqual(service.attempted, ["soffice", "libreoffice"]);
  });

  it("fails fast on non-ENOENT execution error", async () => {
    const service = new TestResumeTemplateDocxService(async (binary) => {
      if (binary === "soffice") {
        const err = new Error("conversion failed") as NodeJS.ErrnoException;
        err.code = "EACCES";
        throw err;
      }
      return;
    });

    await assert.rejects(
      () =>
        (service as unknown as { execLibreOfficeConvert(path: string): Promise<void> }).execLibreOfficeConvert(
          "/tmp/test.docx",
        ),
      /Falha ao converter CV para PDF no servidor/,
    );

    assert.deepEqual(service.attempted, ["soffice"]);
  });

  it("fails application startup in production when converter is missing", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const service = new TestResumeTemplateDocxService(async () => {
        const err = new Error("spawn ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      });

      await assert.rejects(
        () => service.onModuleInit(),
        /PDF converter unavailable in runtime/,
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("throws clear error when converter exits without generating PDF", async () => {
    const service = new TestResumeTemplateDocxService(async () => {
      return;
    });

    await assert.rejects(
      () => service.docxToPdf(Buffer.from("fake-docx")),
      /converter did not generate PDF output/,
    );
  });

  it("retries with xvfb-run when soffice fails with display error", async () => {
    const service = new TestResumeTemplateDocxService(async (binary, args) => {
      if (binary === "soffice") {
        const err = new Error("display error") as NodeJS.ErrnoException & {
          stderr?: string;
        };
        err.code = "EPIPE";
        err.stderr = "X11 error: Can't open display:";
        throw err;
      }

      if (binary === "xvfb-run") {
        assert.equal(args[0], "-a");
        return;
      }

      const err = new Error("unexpected binary") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    await (service as unknown as { execLibreOfficeConvert(path: string): Promise<void> }).execLibreOfficeConvert(
      "/tmp/test.docx",
    );

    assert.deepEqual(service.attempted, ["soffice", "xvfb-run"]);
  });
});
