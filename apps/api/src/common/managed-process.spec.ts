import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  getManagedProcessStats,
  type ManagedProcessFailure,
  runManagedProcess,
} from "./managed-process";

function isAlive(pid: number): boolean {
  try {
    // Zumbi (Z) ja morreu; so falta o init dele colher.
    const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
    return (
      raw.slice(raw.lastIndexOf(")") + 2, raw.lastIndexOf(")") + 3) !== "Z"
    );
  } catch {
    return false;
  }
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ManagedProcessFailure;
  }
  assert.fail("esperava rejeicao");
}

describe("runManagedProcess", () => {
  it("captura stdout de um processo normal", async () => {
    const result = await runManagedProcess("sh", ["-c", "echo ok"], {
      timeoutMs: 5_000,
    });
    assert.equal(result.stdout.trim(), "ok");
  });

  it("rejeita com o exit code quando o processo falha", async () => {
    const error = await rejection(
      runManagedProcess("sh", ["-c", "echo boom >&2; exit 3"], {
        timeoutMs: 5_000,
      }),
    );
    assert.equal(Number(error.code), 3);
    assert.match(error.stderr ?? "", /boom/);
  });

  it("rejeita com ENOENT quando o binario nao existe", async () => {
    const error = await rejection(
      runManagedProcess("binario-que-nao-existe-earlycv", [], {
        timeoutMs: 5_000,
      }),
    );
    assert.equal(error.code, "ENOENT");
  });

  it("no timeout mata a arvore inteira (filho e neto)", async () => {
    // sh -> sleep (neto). Imprime o PID do neto e espera.
    const error = await rejection(
      runManagedProcess("sh", ["-c", "sleep 300 & echo $!; wait"], {
        timeoutMs: 500,
      }),
    );
    assert.equal(error.code, "ETIMEDOUT");
    assert.equal(error.timedOut, true);

    const grandchildPid = Number((error.stdout ?? "").trim());
    assert.ok(grandchildPid > 0, "PID do neto deveria ter sido capturado");
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(isAlive(grandchildPid), false, "neto sobreviveu ao timeout");
  });

  it("escala para SIGKILL quando o processo ignora SIGTERM", async () => {
    const error = await rejection(
      runManagedProcess(
        "sh",
        ["-c", "trap '' TERM; sleep 300 & echo $!; while :; do sleep 1; done"],
        { timeoutMs: 300 },
      ),
    );
    assert.equal(error.code, "ETIMEDOUT");
    const pid = Number((error.stdout ?? "").trim());
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(isAlive(pid), false, "processo que ignora SIGTERM sobreviveu");
  });

  it("limpa netos deixados para tras apos saida normal do lider", async () => {
    // O lider sai na hora, mas o neto segura o stdout — o caso do
    // soffice wrapper que sai deixando soffice.bin.
    const result = await runManagedProcess(
      "sh",
      ["-c", "sleep 300 & echo $!"],
      { timeoutMs: 10_000 },
    );
    const pid = Number(result.stdout.trim());
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(isAlive(pid), false, "neto orfao sobreviveu");
  });

  it("nao deixa contador de processos ativos vazar", async () => {
    await rejection(
      runManagedProcess("sh", ["-c", "sleep 300"], { timeoutMs: 200 }),
    );
    assert.equal(getManagedProcessStats().active, 0);
  });

  describe("o encerramento so atinge processos daquela conversao", () => {
    it("o filho vira lider do proprio grupo, distinto do processo pai", async () => {
      const result = await runManagedProcess(
        "sh",
        ["-c", "cut -d' ' -f1,5 /proc/$$/stat"],
        { timeoutMs: 5_000 },
      );
      const [selfPid, pgrp] = result.stdout.trim().split(" ").map(Number);
      assert.equal(pgrp, selfPid, "filho deve ser lider do proprio grupo");
      const parentStat = readFileSync("/proc/self/stat", "utf8");
      const parentPgrp = Number(
        parentStat.slice(parentStat.lastIndexOf(")") + 2).split(" ")[2],
      );
      assert.notEqual(pgrp, parentPgrp);
    });

    it("timeout de uma conversao nao afeta outra em andamento", async () => {
      const healthy = runManagedProcess("sh", ["-c", "sleep 1.5; echo done"], {
        timeoutMs: 10_000,
      });
      const hung = rejection(
        runManagedProcess("sh", ["-c", "sleep 300 & wait"], { timeoutMs: 400 }),
      );

      const error = await hung;
      assert.equal(error.code, "ETIMEDOUT");
      const result = await healthy;
      assert.equal(result.stdout.trim(), "done");
    });

    it("nao mata processos do chamador nem irmaos fora do grupo", async () => {
      const bystander = spawn("sleep", ["300"], { stdio: "ignore" });
      try {
        await rejection(
          runManagedProcess("sh", ["-c", "sleep 300 & wait"], {
            timeoutMs: 300,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(
          bystander.pid !== undefined && isAlive(bystander.pid),
          true,
        );
        assert.equal(process.kill(process.pid, 0), true);
      } finally {
        bystander.kill("SIGKILL");
      }
    });
  });
});
