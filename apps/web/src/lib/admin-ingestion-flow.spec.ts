import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAdminRedirect,
  getSourceDefaults,
  isRedirectControlFlowError,
  parseCompanyFormData,
  parseJobSourceFormData,
} from "./admin-ingestion-flow";

test("buildAdminRedirect preserves the token and appends wizard state", () => {
  const location = buildAdminRedirect(
    "/admin/ingestion/new?token=abc",
    "success",
    "Empresa criada.",
    {
      companyId: "cmp_123",
      step: "job-source",
    },
  );

  assert.equal(
    location,
    "/admin/ingestion/new?token=abc&status=success&message=Empresa+criada.&companyId=cmp_123&step=job-source",
  );
});

test("getSourceDefaults maps source type to parser and crawl strategy", () => {
  assert.deepEqual(getSourceDefaults("custom_html"), {
    crawlStrategy: "html",
    parserKey: "custom_html",
    sourceType: "custom_html",
  });

  assert.deepEqual(getSourceDefaults("custom_api"), {
    crawlStrategy: "api",
    parserKey: "custom_api",
    sourceType: "custom_api",
  });
});

test("parseCompanyFormData trims fields and omits blank optional values", () => {
  const formData = new FormData();

  formData.set("name", "  ACME Labs  ");
  formData.set("websiteUrl", " https://acme.dev ");
  formData.set("careersUrl", "");
  formData.set("linkedinUrl", " https://www.linkedin.com/company/acme-labs ");
  formData.set("industry", "  Tecnologia  ");
  formData.set("country", "  Brasil  ");

  assert.deepEqual(parseCompanyFormData(formData), {
    country: "Brasil",
    industry: "Tecnologia",
    linkedinUrl: "https://www.linkedin.com/company/acme-labs",
    name: "ACME Labs",
    websiteUrl: "https://acme.dev",
  });
});

test("parseJobSourceFormData derives parser defaults from the selected type", () => {
  const formData = new FormData();

  formData.set("companyId", "cmp_123");
  formData.set("sourceName", "  ACME Careers  ");
  formData.set("sourceType", "custom_api");
  formData.set("sourceUrl", " https://acme.dev/careers ");
  formData.set("checkIntervalMinutes", "30");
  formData.set("isActive", "on");

  assert.deepEqual(parseJobSourceFormData(formData), {
    checkIntervalMinutes: 30,
    companyId: "cmp_123",
    crawlStrategy: "api",
    isActive: true,
    parserKey: "custom_api",
    sourceName: "ACME Careers",
    sourceType: "custom_api",
    sourceUrl: "https://acme.dev/careers",
  });
});

test("isRedirectControlFlowError detects Next redirect errors", () => {
  const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
    digest: "NEXT_REDIRECT;/admin/ingestion/new;push",
  });

  assert.equal(isRedirectControlFlowError(redirectError), true);
  assert.equal(isRedirectControlFlowError(new Error("regular error")), false);
});
