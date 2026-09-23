import { describe, expect, it } from "vitest";
import {
  extractApiErrorMessage,
  sanitizeDomainErrorMessage,
} from "./cv-adaptation-api-errors";

describe("extractApiErrorMessage", () => {
  it("usa a mensagem de domínio quando o backend manda uma string clara", () => {
    const raw = JSON.stringify({ message: "CV inválido." });
    expect(extractApiErrorMessage(raw, "fallback")).toBe("CV inválido.");
  });

  it("junta mensagens de validação em array", () => {
    const raw = JSON.stringify({ message: ["campo A", "campo B"] });
    expect(extractApiErrorMessage(raw, "fallback")).toBe("campo A | campo B");
  });

  it("nunca repassa o corpo genérico default do NestJS pra exceção não tratada", () => {
    const raw = JSON.stringify({
      statusCode: 500,
      message: "Internal Server Error",
    });
    expect(extractApiErrorMessage(raw, "fallback")).toBe("fallback");
  });

  it("é insensível a maiúsculas/minúsculas ao filtrar mensagens genéricas", () => {
    const raw = JSON.stringify({ message: "internal server error" });
    expect(extractApiErrorMessage(raw, "fallback")).toBe("fallback");
  });

  it("cai no fallback pra um documento HTML (ex: página de erro do proxy)", () => {
    expect(extractApiErrorMessage("<!DOCTYPE html><html></html>", "fallback")).toBe(
      "fallback",
    );
  });
});

describe("sanitizeDomainErrorMessage", () => {
  it("repassa uma mensagem de domínio curta em português", () => {
    expect(
      sanitizeDomainErrorMessage(
        "O texto informado não parece uma descrição de vaga.",
        "fallback",
      ),
    ).toBe("O texto informado não parece uma descrição de vaga.");
  });

  it("nunca repassa o erro técnico real que vazou em produção (XMinioStorageFull)", () => {
    expect(
      sanitizeDomainErrorMessage(
        "XMinioStorageFull: Storage backend has reached its minimum free drive threshold. Please delete a few objects to proceed.",
        "fallback",
      ),
    ).toBe("fallback");
  });

  it("nunca repassa um stack trace", () => {
    const stack =
      "TypeError: Cannot read properties of undefined (reading 'foo')\n    at Object.<anonymous> (/app/src/x.ts:10:5)";
    expect(sanitizeDomainErrorMessage(stack, "fallback")).toBe("fallback");
  });

  it("cai no fallback quando lastError é null/vazio", () => {
    expect(sanitizeDomainErrorMessage(null, "fallback")).toBe("fallback");
    expect(sanitizeDomainErrorMessage("   ", "fallback")).toBe("fallback");
  });

  it("cai no fallback pra mensagens longas demais (provavelmente técnicas)", () => {
    const long = "a".repeat(301);
    expect(sanitizeDomainErrorMessage(long, "fallback")).toBe("fallback");
  });
});
