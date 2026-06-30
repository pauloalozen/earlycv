import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

const pageShellTsx = () =>
  readFileSync(resolve(currentDir, "../components/page-shell.tsx"), "utf8");
const globalsCss = () =>
  readFileSync(resolve(currentDir, "../app/globals.css"), "utf8");

test("PageShell reveals on mount and on bfcache restore (pageshow)", () => {
  const content = pageShellTsx();

  assert.match(content, /setTimeout\(\(\) => setReady\(true\), 100\)/);
  assert.match(content, /addEventListener\("pageshow"/);
});

test("PageShell never gates children behind ready (content always rendered)", () => {
  const content = pageShellTsx();

  // O conteúdo não pode ficar escondido atrás de um estado que só o JS libera.
  assert.doesNotMatch(content, /\{ready && /);
  assert.doesNotMatch(content, /\{!ready && children\}/);
  assert.match(content, /page-shell-cover/);
});

test("PageShell cover has a CSS failsafe so it can never stick (infinite spinner)", () => {
  const css = globalsCss();

  // Failsafe: o cover se dissolve sozinho mesmo sem hidratação do JS.
  assert.match(css, /\.page-shell-cover\b/);
  assert.match(css, /animation:\s*page-shell-cover-failsafe/);
  assert.match(css, /@keyframes page-shell-cover-failsafe/);
});
