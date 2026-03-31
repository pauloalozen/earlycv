import { twMerge } from "tailwind-merge";

type ClassNameValue = false | null | string | undefined;

export function cn(...inputs: ClassNameValue[]) {
  return twMerge(inputs.filter(Boolean).join(" "));
}
