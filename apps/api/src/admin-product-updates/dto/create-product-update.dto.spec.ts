import assert from "node:assert/strict";
import { test } from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateProductUpdateDto } from "./create-product-update.dto";

const BASE = {
  internalName: "Campanha teste",
  subject: "Assunto",
  content: "Conteúdo",
};

async function validateDto(overrides: Record<string, unknown>) {
  const dto = plainToInstance(CreateProductUpdateDto, {
    ...BASE,
    ...overrides,
  });
  return validate(dto);
}

const UNSAFE_URLS = [
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  'https://earlycv.com.br/x" onmouseover="alert(1)',
  "/monitor",
  "http://earlycv.com.br/monitor",
  "not a url at all",
];

for (const url of UNSAFE_URLS) {
  test(`CreateProductUpdateDto rejects primaryButtonUrl=${JSON.stringify(url)}`, async () => {
    const errors = await validateDto({
      primaryButtonText: "Ver mais",
      primaryButtonUrl: url,
    });
    assert.ok(errors.length > 0, `expected validation error for ${url}`);
    assert.ok(
      errors.some((e) => e.property === "primaryButtonUrl"),
      `expected the error to be on primaryButtonUrl for ${url}`,
    );
  });
}

const SAFE_URLS = [
  "https://earlycv.com.br/monitor",
  "https://earlycv.com.br/monitor?utm_source=email&utm_campaign=teste",
];

for (const url of SAFE_URLS) {
  test(`CreateProductUpdateDto accepts primaryButtonUrl=${JSON.stringify(url)}`, async () => {
    const errors = await validateDto({
      primaryButtonText: "Ver mais",
      primaryButtonUrl: url,
    });
    assert.equal(errors.length, 0);
  });
}

test("CreateProductUpdateDto accepts a campaign with no button at all", async () => {
  const errors = await validateDto({});
  assert.equal(errors.length, 0);
});
