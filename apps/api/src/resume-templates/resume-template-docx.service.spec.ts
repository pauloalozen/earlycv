import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ResumeTemplateDocxService } from "./resume-template-docx.service";

class TestResumeTemplateDocxService extends ResumeTemplateDocxService {
  public readonly attempted: string[] = [];

  constructor(
    private readonly behavior: (binary: string) => Promise<void>,
  ) {
    super({} as never);
  }

  protected override async runExecFile(
    binary: string,
    _args: string[],
  ): Promise<void> {
    this.attempted.push(binary);
    await this.behavior(binary);
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
});
