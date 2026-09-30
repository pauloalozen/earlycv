import { spawn } from "node:child_process";

// Substitui execFile onde um processo externo pode travar (LibreOffice,
// xvfb-run). execFile so mata o filho DIRETO no timeout, e mesmo isso so
// se `timeout` for passado — netos (soffice.bin, Xvfb) sobreviviam e
// ficavam ocupando memoria ate o container reiniciar.
//
// Aqui o filho vira lider de um process group proprio (detached => setsid),
// e o encerramento (timeout ou fim normal) e feito no grupo inteiro:
// SIGTERM, uma janela curta de graca e SIGKILL.

const MAX_CAPTURED_BYTES = 1024 * 1024;
const KILL_GRACE_MS = 3_000;
const EXIT_FLUSH_MS = 500;

export type ManagedProcessResult = { stderr: string; stdout: string };

export type ManagedProcessFailure = NodeJS.ErrnoException & {
  stderr?: string;
  stdout?: string;
  timedOut?: boolean;
};

export type ManagedProcessStats = {
  active: number;
  failed: number;
  killedTrees: number;
  started: number;
  timedOut: number;
};

const stats: ManagedProcessStats = {
  active: 0,
  failed: 0,
  killedTrees: 0,
  started: 0,
  timedOut: 0,
};

export function getManagedProcessStats(): ManagedProcessStats {
  return { ...stats };
}

function killGroup(pid: number, signal: NodeJS.Signals): boolean {
  // Guarda: so sinalizamos grupos criados por nos (pid do filho detached).
  // Nunca o proprio processo, o init ou pid invalido — process.kill(-1)
  // atingiria todos os processos do usuario.
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    // ESRCH: grupo ja nao existe — nada a matar.
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      try {
        process.kill(pid, signal);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function appendCapped(current: string, chunk: Buffer): string {
  if (current.length >= MAX_CAPTURED_BYTES) return current;
  return current + chunk.toString("utf8", 0, MAX_CAPTURED_BYTES);
}

export function runManagedProcess(
  binary: string,
  args: string[],
  options: { timeoutMs: number },
): Promise<ManagedProcessResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeoutError: ManagedProcessFailure | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;
    let exitTimer: NodeJS.Timeout | null = null;

    stats.started += 1;
    stats.active += 1;

    const child = spawn(binary, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const pid = child.pid;

    const settle = (error: ManagedProcessFailure | null) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      if (exitTimer) clearTimeout(exitTimer);
      stats.active -= 1;

      // Limpeza do grupo mesmo em saida normal: um wrapper (soffice ->
      // oosplash -> soffice.bin) pode sair deixando o filho de pe.
      if (pid !== undefined && killGroup(pid, "SIGKILL") && !timedOut) {
        stats.killedTrees += 1;
      }

      if (error) {
        stats.failed += 1;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stderr, stdout });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk);
    });

    child.on("error", (error) => {
      settle(error as ManagedProcessFailure);
    });

    const finishFromExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ) => {
      if (timedOut) {
        // Lider morreu apos o SIGTERM: nao precisa esperar o SIGKILL.
        settle(timeoutError);
        return;
      }
      if (code === 0) {
        settle(null);
        return;
      }
      const error: ManagedProcessFailure = new Error(
        `Command failed: ${binary} ${args.join(" ")}\n${stderr}`,
      );
      error.code = (code ?? signal ?? "UNKNOWN") as unknown as string;
      settle(error);
    };

    // 'close' so dispara quando TODOS os donos dos pipes fecham; se o
    // wrapper sai e deixa um neto (soffice.bin) segurando stdout, ele nunca
    // viria. Depois do 'exit' do lider damos uma janela curta pro flush e
    // seguimos — settle() encerra o grupo remanescente.
    child.on("exit", (code, signal) => {
      exitTimer = setTimeout(() => finishFromExit(code, signal), EXIT_FLUSH_MS);
    });
    child.on("close", (code, signal) => {
      finishFromExit(code, signal);
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      stats.timedOut += 1;
      stats.killedTrees += 1;

      const error: ManagedProcessFailure = new Error(
        `${binary} excedeu ${options.timeoutMs}ms e foi encerrado`,
      );
      error.code = "ETIMEDOUT";
      error.timedOut = true;
      timeoutError = error;

      if (pid === undefined) {
        settle(error);
        return;
      }

      killGroup(pid, "SIGTERM");
      killTimer = setTimeout(() => {
        // settle() faz o SIGKILL final do grupo.
        settle(error);
      }, KILL_GRACE_MS);
    }, options.timeoutMs);
  });
}
