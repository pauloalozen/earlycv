import assert from "node:assert/strict";
import { test } from "node:test";

import type { JobApplicationDto } from "@/lib/job-applications-api";
import {
  buildBoardColumns,
  columnForStatus,
  compareBoardOrder,
  matchesBoardFilters,
  preApplicationStatus,
  type QuickFilterKey,
  statusForColumn,
} from "./board-logic";

function app(
  id: string,
  status: JobApplicationDto["status"],
  updatedAt: string,
  boardPosition: number | null = null,
) {
  return { id, status, updatedAt, boardPosition } as JobApplicationDto;
}

test("columnForStatus: analisar e liberar CV ficam dentro de Salva", () => {
  assert.equal(columnForStatus("SAVED"), "saved");
  assert.equal(columnForStatus("ANALYZED"), "saved");
  assert.equal(columnForStatus("CV_READY"), "saved");
  assert.equal(columnForStatus("APPLIED"), "applied");
  assert.equal(columnForStatus("ASSESSMENT"), "interview");
  assert.equal(columnForStatus("OFFER"), "interview");
  assert.equal(columnForStatus("WITHDRAWN"), "closed");
});

const progress = (overrides: Partial<JobApplicationDto> = {}) =>
  ({
    bestCvState: "missing",
    cvAdaptations: [],
    currentCvAdaptationId: null,
    bestScore: null,
    scoreAfter: null,
    scoreBefore: null,
    ...overrides,
  }) as JobApplicationDto;

test("voltar pra Salva nunca apaga o progresso de antes da candidatura", () => {
  assert.equal(preApplicationStatus(progress()), "SAVED");
  assert.equal(
    preApplicationStatus(progress({ currentCvAdaptationId: "ad-1" })),
    "ANALYZED",
  );
  assert.equal(preApplicationStatus(progress({ bestScore: 70 })), "ANALYZED");
  assert.equal(
    preApplicationStatus(progress({ bestCvState: "ready" })),
    "CV_READY",
  );
  assert.equal(
    preApplicationStatus(
      progress({
        cvAdaptations: [
          {
            id: "ad-1",
            status: "delivered",
            isUnlocked: false,
            adaptedResumeId: null,
            createdAt: "2026-09-01T00:00:00Z",
          },
        ],
      }),
    ),
    "CV_READY",
  );
});

test("statusForColumn: Em entrevista entra como INTERVIEW e Finalizado exige escolha", () => {
  assert.equal(statusForColumn("applied", progress()), "APPLIED");
  assert.equal(statusForColumn("interview", progress()), "INTERVIEW");
  assert.equal(statusForColumn("closed", progress()), null);
  assert.equal(
    statusForColumn("saved", progress({ bestScore: 70 })),
    "ANALYZED",
  );
});

test("ordem da etapa: posição manual primeiro, depois as nunca reordenadas pela atualização mais recente", () => {
  const items = [
    app("old", "APPLIED", "2026-09-01T00:00:00Z"),
    app("second", "APPLIED", "2026-09-02T00:00:00Z", 1),
    app("new", "APPLIED", "2026-09-30T00:00:00Z"),
    app("first", "APPLIED", "2026-08-01T00:00:00Z", 0),
  ];
  assert.deepEqual(
    [...items].sort(compareBoardOrder).map((i) => i.id),
    ["first", "second", "new", "old"],
  );
});

test("buildBoardColumns distribui e ordena por etapa", () => {
  const columns = buildBoardColumns([
    app("a", "SAVED", "2026-09-01T00:00:00Z"),
    app("a2", "CV_READY", "2026-08-01T00:00:00Z"),
    app("b", "INTERVIEW", "2026-09-01T00:00:00Z", 1),
    app("c", "ASSESSMENT", "2026-09-01T00:00:00Z", 0),
    app("d", "HIRED", "2026-09-01T00:00:00Z"),
  ]);
  assert.deepEqual(columns.saved, ["a", "a2"]);
  assert.deepEqual(columns.interview, ["c", "b"]);
  assert.deepEqual(columns.closed, ["d"]);
  assert.deepEqual(columns.applied, []);
});

test("filtros rápidos: qualquer um dos marcados, combinado com a empresa", () => {
  const analyzed = {
    ...app("a", "ANALYZED", "2026-09-01T00:00:00Z"),
    companyName: "Acme",
  } as JobApplicationDto;
  const released = {
    ...app("b", "CV_READY", "2026-09-01T00:00:00Z"),
    companyName: "Acme",
    bestCvState: "ready",
  } as JobApplicationDto;
  const closed = {
    ...app("c", "APPLIED", "2026-09-01T00:00:00Z"),
    companyName: "Globex",
    jobClosed: true,
  } as JobApplicationDto;
  const all = [analyzed, released, closed];
  const ids = (company: string, filters: QuickFilterKey[]) =>
    all
      .filter((item) => matchesBoardFilters(item, company, filters))
      .map((item) => item.id);

  assert.deepEqual(ids("", []), ["a", "b", "c"]);
  assert.deepEqual(ids("", ["cv_analyzed"]), ["a"]);
  assert.deepEqual(ids("", ["cv_analyzed", "cv_released"]), ["a", "b"]);
  assert.deepEqual(ids("", ["cv_adapted"]), ["b"]);
  assert.deepEqual(ids("", ["job_closed"]), ["c"]);
  assert.deepEqual(ids("Acme", ["job_closed"]), []);
  assert.deepEqual(ids("Acme", []), ["a", "b"]);
});
