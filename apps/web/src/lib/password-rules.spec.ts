import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SIGNUP_PASSWORD_RULES,
  validateSignupPassword,
} from "./password-rules";

test("SIGNUP_PASSWORD_RULES keeps the expected password checklist", () => {
  assert.deepEqual(
    SIGNUP_PASSWORD_RULES.map((rule) => rule.label),
    [
      "Mínimo 8 caracteres",
      "Pelo menos uma letra maiúscula",
      "Pelo menos um número",
    ],
  );
});

test("validateSignupPassword validates the same rules used on signup", () => {
  assert.equal(validateSignupPassword("abcdefgh"), false);
  assert.equal(validateSignupPassword("Abcdefgh"), false);
  assert.equal(validateSignupPassword("abcde123"), false);
  assert.equal(validateSignupPassword("Abcd1234"), true);
});
