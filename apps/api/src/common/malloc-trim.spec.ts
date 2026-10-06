import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { Logger } from "@nestjs/common";

import {
  isMallocTrimEnabled,
  loadMallocTrim,
  runMallocTrimTick,
  startMallocTrim,
  stopMallocTrimForTest,
} from "./malloc-trim";

const MB = 1024 * 1024;

function logged(spy: ReturnType<typeof mock.method>) {
  return spy.mock.calls.map((call) => JSON.parse(String(call.arguments[0])));
}

describe("malloc-trim", () => {
  afterEach(() => {
    delete process.env.MALLOC_TRIM_ENABLED;
    delete process.env.MALLOC_TRIM_INTERVAL_MS;
    delete process.env.MALLOC_TRIM_MIN_RSS_MB;
    stopMallocTrimForTest();
    mock.restoreAll();
    mock.timers.reset();
  });

  it("fica ligado por padrao no linux e desliga com MALLOC_TRIM_ENABLED=false", () => {
    assert.equal(isMallocTrimEnabled(), process.platform === "linux");
    process.env.MALLOC_TRIM_ENABLED = "false";
    assert.equal(isMallocTrimEnabled(), false);
  });

  it("chama malloc_trim(0) e loga rss antes/depois, liberado e duracao", () => {
    const spy = mock.method(Logger.prototype, "log", () => {});
    const rss = [900 * MB, 150 * MB];
    const clock = [1_000, 1_250];
    const trim = mock.fn((_pad: number) => 1);

    runMallocTrimTick({
      minRssMb: 300,
      now: () => clock.shift() ?? 0,
      readRss: () => rss.shift() ?? 0,
      trim,
    });

    assert.deepEqual(trim.mock.calls[0].arguments, [0]);
    assert.deepEqual(logged(spy), [
      {
        durationMs: 250,
        event: "mem_trim",
        freedMb: 750,
        released: true,
        rssAfterMb: 150,
        rssBeforeMb: 900,
      },
    ]);
  });

  it("nao chama o trim abaixo do RSS minimo, mas loga o motivo", () => {
    const spy = mock.method(Logger.prototype, "log", () => {});
    const trim = mock.fn((_pad: number) => 1);

    runMallocTrimTick({
      minRssMb: 300,
      now: () => 0,
      readRss: () => 200 * MB,
      trim,
    });

    assert.equal(trim.mock.callCount(), 0);
    assert.deepEqual(logged(spy), [
      {
        event: "mem_trim",
        minRssMb: 300,
        rssBeforeMb: 200,
        skipped: "below_min_rss",
      },
    ]);
  });

  it("erro no trim vira warn e nao propaga", () => {
    const warn = mock.method(Logger.prototype, "warn", () => {});
    mock.method(Logger.prototype, "log", () => {});

    assert.doesNotThrow(() =>
      runMallocTrimTick({
        minRssMb: 0,
        now: () => 0,
        readRss: () => 500 * MB,
        trim: () => {
          throw new Error("boom");
        },
      }),
    );
    assert.equal(
      JSON.parse(String(warn.mock.calls[0].arguments[0])).event,
      "mem_trim_failed",
    );
  });

  it("agenda de hora em hora e roda o trim a cada intervalo", async () => {
    if (process.platform !== "linux") return;
    mock.method(Logger.prototype, "log", () => {});
    mock.timers.enable({ apis: ["setInterval"] });
    const trim = mock.fn((_pad: number) => 1);

    process.env.MALLOC_TRIM_MIN_RSS_MB = "0";
    await startMallocTrim(async () => trim);

    mock.timers.tick(59 * 60_000);
    assert.equal(trim.mock.callCount(), 0);
    mock.timers.tick(60_000);
    assert.equal(trim.mock.callCount(), 1);
    mock.timers.tick(60 * 60_000);
    assert.equal(trim.mock.callCount(), 2);
  });

  it("nao agenda nada quando desligado ou sem malloc_trim disponivel", async () => {
    mock.timers.enable({ apis: ["setInterval"] });
    process.env.MALLOC_TRIM_ENABLED = "false";
    const loader = mock.fn(async () => null);
    await startMallocTrim(loader);
    assert.equal(loader.mock.callCount(), 0);

    delete process.env.MALLOC_TRIM_ENABLED;
    stopMallocTrimForTest();
    await startMallocTrim(loader);
    mock.timers.tick(2 * 60 * 60_000);
    assert.equal(loader.mock.callCount(), process.platform === "linux" ? 1 : 0);
  });

  it("carrega o malloc_trim real do glibc e ele roda sem erro", async () => {
    if (process.platform !== "linux") return;
    const trim = await loadMallocTrim();
    assert.ok(trim);
    assert.ok([0, 1].includes(trim(0)));
  });
});
