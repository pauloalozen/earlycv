export type PasswordRule = {
  label: string;
  test: (value: string) => boolean;
};

export const SIGNUP_PASSWORD_RULES: PasswordRule[] = [
  { label: "Mínimo 8 caracteres", test: (value) => value.length >= 8 },
  {
    label: "Pelo menos uma letra maiúscula",
    test: (value) => /[A-Z]/.test(value),
  },
  { label: "Pelo menos um número", test: (value) => /[0-9]/.test(value) },
];

export function validateSignupPassword(value: string): boolean {
  return SIGNUP_PASSWORD_RULES.every((rule) => rule.test(value));
}
