import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { UpdateCompanyDto } from "./update-company.dto";

test("UpdateCompanyDto aceita displayName, com trim, e vazio limpa o campo", async () => {
  const filled = plainToInstance(UpdateCompanyDto, {
    displayName: "  Let's Rent a Car  ",
  });
  assert.deepEqual(await validate(filled), []);
  assert.equal(filled.displayName, "Let's Rent a Car");

  const cleared = plainToInstance(UpdateCompanyDto, { displayName: "   " });
  assert.deepEqual(await validate(cleared), []);
  assert.equal(cleared.displayName, null);

  const tooLong = plainToInstance(UpdateCompanyDto, {
    displayName: "x".repeat(161),
  });
  assert.equal((await validate(tooLong)).length, 1);
});
