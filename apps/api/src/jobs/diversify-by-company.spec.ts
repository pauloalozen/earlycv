import assert from "node:assert/strict";
import { test } from "node:test";

import { diversifyByCompany } from "./diversify-by-company";

const order = (companies: string) =>
  diversifyByCompany(
    companies.split("").map((company, rank) => ({ company, rank })),
    (item) => item.company,
  )
    .map((item) => `${item.company}${item.rank}`)
    .join(" ");

test("keeps the original order when there is no long same-company streak", () => {
  assert.equal(order("ABACBC"), "A0 B1 A2 C3 B4 C5");
});

test("never shows more than 2 jobs of the same company in a row while others remain", () => {
  assert.equal(order("AAAAAABC"), "A0 A1 B6 A2 A3 C7 A4 A5");
});

test("pulls the best-ranked job of another company, preserving relative order", () => {
  assert.equal(order("AAABBBC"), "A0 A1 B3 A2 B4 B5 C6");
});

test("lets the remaining jobs of a single company run in sequence at the end", () => {
  assert.equal(order("AAAAB"), "A0 A1 B4 A2 A3");
});

test("is deterministic and returns every item exactly once", () => {
  const items = Array.from({ length: 500 }, (_, rank) => ({
    company: rank % 7 === 0 ? "B" : "A",
    rank,
  }));
  const first = diversifyByCompany(items, (item) => item.company);
  const second = diversifyByCompany(items, (item) => item.company);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((item) => item.rank)).size, 500);
});

test("handles an empty list", () => {
  assert.deepEqual(
    diversifyByCompany([], () => "A"),
    [],
  );
});
