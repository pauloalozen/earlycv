import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, mock } from "node:test";
import { Logger } from "@nestjs/common";

import {
  buildSample,
  isMemoryDiagnosticsEnabled,
  parseProcStat,
  readCgroupMemory,
  readProcessTree,
  runSampleTick,
  startMemoryDiagnostics,
  stopMemoryDiagnosticsForTest,
  trackConversion,
  trackJob,
} from "./memory-diagnostics";

describe("memory-diagnostics", () => {
  afterEach(() => {
    delete process.env.MEMORY_DIAGNOSTICS_ENABLED;
    stopMemoryDiagnosticsForTest();
    mock.restoreAll();
    mock.timers.reset();
  });

  it("fica desligado por padrao e so repassa a execucao", async () => {
    assert.equal(isMemoryDiagnosticsEnabled(), false);
    assert.equal(await trackJob("x", async () => 7), 7);
    assert.equal(await trackConversion("x", async () => "ok"), "ok");
  });

  it("nao altera resultado nem excecao com a flag ligada", async () => {
    process.env.MEMORY_DIAGNOSTICS_ENABLED = "true";
    assert.equal(await trackJob("job-a", async () => 3), 3);
    await assert.rejects(
      trackJob("job-b", async () => {
        throw new Error("falha original");
      }),
      /falha original/,
    );
    await assert.rejects(
      trackConversion("conv-a", async () => {
        throw new Error("falha conversao");
      }),
      /falha conversao/,
    );
  });

  it("parseia /proc/<pid>/stat com comm contendo espacos e parenteses", () => {
    // campos apos ")": state ppid pgrp session tty tpgid flags minflt cminflt
    // majflt cmajflt utime stime cutime cstime priority nice threads itreal
    // starttime(22) ...
    const raw =
      "4242 (weird (name) x) S 100 4242 4242 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 987654 0 0";
    const parsed = parseProcStat(raw);
    assert.deepEqual(parsed, {
      comm: "weird (name) x",
      pgrp: 4242,
      pid: 4242,
      ppid: 100,
      startTicks: 987654,
    });
  });

  it("lista descendentes do processo atual via /proc (Linux)", async (t) => {
    if (process.platform !== "linux") {
      t.skip("/proc so existe no Linux");
      return;
    }
    const { spawn } = await import("node:child_process");
    const child = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      const tree = readProcessTree();
      assert.ok(tree);
      assert.ok(tree.children.count >= 1);
      assert.ok(tree.children.top.some((c) => c.pid === child.pid));
    } finally {
      child.kill("SIGKILL");
    }
  });

  it("le cgroup v2 separando anon de file e mantendo o working set aproximado", () => {
    const root = mkdtempSync(join(tmpdir(), "cgroup-v2-"));
    writeFileSync(join(root, "memory.current"), `${3000 * 1024 * 1024}\n`);
    writeFileSync(join(root, "memory.max"), "max\n");
    writeFileSync(
      join(root, "memory.stat"),
      [
        `anon ${1200 * 1024 * 1024}`,
        `file ${1500 * 1024 * 1024}`,
        `inactive_file ${1000 * 1024 * 1024}`,
        `slab ${100 * 1024 * 1024}`,
        "pgfault 123",
      ].join("\n"),
    );

    const result = readCgroupMemory(root);
    assert.ok(result);
    assert.equal(result.version, 2);
    assert.equal(result.currentMb, 3000);
    assert.equal(result.maxMb, null);
    assert.equal(result.stat.anonMb, 1200);
    assert.equal(result.stat.fileMb, 1500);
    assert.equal(result.stat.slabMb, 100);
    assert.equal(result.workingSetApproxMb, 2000);
    assert.equal("pgfaultMb" in result.stat, false);
  });

  it("le cgroup v1 como fallback e retorna null sem cgroup", () => {
    const root = mkdtempSync(join(tmpdir(), "cgroup-v1-"));
    mkdirSync(join(root, "memory"));
    writeFileSync(
      join(root, "memory", "memory.usage_in_bytes"),
      `${500 * 1024 * 1024}`,
    );
    writeFileSync(
      join(root, "memory", "memory.stat"),
      `total_rss ${300 * 1024 * 1024}\ntotal_cache ${200 * 1024 * 1024}`,
    );
    const v1 = readCgroupMemory(root);
    assert.equal(v1?.version, 1);
    assert.equal(v1?.stat.total_rssMb, 300);

    assert.equal(readCgroupMemory(mkdtempSync(join(tmpdir(), "empty-"))), null);
  });

  describe("falhas de coleta nao interrompem a API", () => {
    const failing = () => {
      throw new Error("EACCES: /proc indisponivel");
    };

    it("readProcessTree retorna null quando /proc nao existe", () => {
      assert.equal(readProcessTree(process.pid, "/caminho/inexistente"), null);
    });

    it("readProcessTree ignora entradas corrompidas de /proc sem lancar", () => {
      const root = mkdtempSync(join(tmpdir(), "proc-corrupt-"));
      writeFileSync(join(root, "uptime"), "1000.00 900.00\n");
      mkdirSync(join(root, "10"));
      writeFileSync(join(root, "10", "stat"), "lixo sem parenteses");
      mkdirSync(join(root, "11")); // sem arquivo stat
      mkdirSync(join(root, "12"));
      writeFileSync(
        join(root, "12", "stat"),
        "12 (soffice.bin) S 1 12 12 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 500 0 0",
      );
      // sem status: RSS desconhecido, mas o processo ainda e listado

      const tree = readProcessTree(999_999, root);
      assert.ok(tree);
      assert.equal(tree.children.count, 0);
      assert.equal(tree.orphanSuspects.count, 1);
      assert.equal(tree.orphanSuspects.top[0].comm, "soffice.bin");
      assert.equal(tree.orphanSuspects.top[0].rssMb, null);
    });

    it("buildSample omite so a secao que falhou", () => {
      const sample = buildSample({
        cgroup: failing,
        processes: failing,
        v8: () => ({ ok: true }),
      });
      assert.equal(sample.cgroup, null);
      assert.equal(sample.processes, null);
      assert.deepEqual(sample.v8, { ok: true });
      assert.ok(sample.node);
      assert.equal(sample.pid, process.pid);
    });

    it("runSampleTick nunca lanca e o proximo tick continua funcionando", () => {
      process.env.MEMORY_DIAGNOSTICS_ENABLED = "true";
      const log = mock.method(Logger.prototype, "log", () => undefined);

      assert.doesNotThrow(() =>
        runSampleTick({ cgroup: failing, processes: failing, v8: failing }),
      );
      runSampleTick({
        cgroup: () => null,
        processes: () => null,
        v8: () => null,
      });

      assert.equal(log.mock.callCount(), 2);
    });
  });

  describe("sampler nao sobrepoe coletas nem acumula tarefas", () => {
    it("um tick reentrante e descartado, nao enfileirado", () => {
      const log = mock.method(Logger.prototype, "log", () => undefined);
      let nested = 0;
      const readers = {
        cgroup: () => null,
        processes: () => {
          // simula uma coleta ainda em andamento quando outro tick dispara
          runSampleTick({
            cgroup: () => null,
            processes: () => {
              nested += 1;
              return null;
            },
            v8: () => null,
          });
          return null;
        },
        v8: () => null,
      };

      runSampleTick(readers);

      assert.equal(nested, 0, "tick interno deveria ter sido descartado");
      assert.equal(log.mock.callCount(), 1);
    });

    it("usa um unico timer, mesmo chamando start varias vezes", (t) => {
      process.env.MEMORY_DIAGNOSTICS_ENABLED = "true";
      process.env.MEMORY_DIAGNOSTICS_INTERVAL_MS = "1000";
      t.after(() => {
        delete process.env.MEMORY_DIAGNOSTICS_INTERVAL_MS;
      });
      mock.timers.enable({ apis: ["setInterval"] });
      const log = mock.method(Logger.prototype, "log", () => undefined);

      startMemoryDiagnostics();
      startMemoryDiagnostics();
      startMemoryDiagnostics();
      mock.timers.tick(3_000);

      const events = log.mock.calls.map(
        (call) =>
          (JSON.parse(String(call.arguments[0])) as { event: string }).event,
      );
      const boot = JSON.parse(String(log.mock.calls[0].arguments[0])) as Record<
        string,
        unknown
      >;
      assert.ok("pid1Comm" in boot, "mem_boot deve registrar o PID 1");
      assert.deepEqual(events, [
        "mem_boot",
        "mem_sample",
        "mem_sample",
        "mem_sample",
      ]);
    });

    it("nao faz nada com a flag desligada", () => {
      mock.timers.enable({ apis: ["setInterval"] });
      const log = mock.method(Logger.prototype, "log", () => undefined);
      startMemoryDiagnostics();
      mock.timers.tick(120_000);
      assert.equal(log.mock.callCount(), 0);
    });
  });
});
