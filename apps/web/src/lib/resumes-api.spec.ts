import assert from "node:assert/strict";
import { test } from "node:test";

import { getMasterResumeFromList } from "./resumes-selectors.ts";

test("getMasterResumeFromList returns null when no master resume exists", () => {
  assert.equal(
    getMasterResumeFromList([
      {
        id: "resume_1",
        isMaster: false,
        sourceFileName: "base.pdf",
        title: "CV base",
        updatedAt: "2026-01-10T00:00:00.000Z",
      },
      {
        id: "resume_2",
        isMaster: false,
        sourceFileName: null,
        title: "CV adaptado",
        updatedAt: "2026-01-11T00:00:00.000Z",
      },
    ]),
    null,
  );
});

test("getMasterResumeFromList returns the first master resume when present", () => {
  assert.deepEqual(
    getMasterResumeFromList([
      {
        id: "resume_1",
        isMaster: false,
        sourceFileName: "base.pdf",
        title: "CV base",
        updatedAt: "2026-01-10T00:00:00.000Z",
      },
      {
        id: "resume_2",
        isMaster: true,
        sourceFileName: "master.pdf",
        title: "CV master",
        updatedAt: "2026-01-11T00:00:00.000Z",
      },
      {
        id: "resume_3",
        isMaster: true,
        sourceFileName: "other-master.pdf",
        title: "CV master antigo",
        updatedAt: "2026-01-09T00:00:00.000Z",
      },
    ]),
    {
      id: "resume_2",
      isMaster: true,
      sourceFileName: "master.pdf",
      title: "CV master",
      updatedAt: "2026-01-11T00:00:00.000Z",
    },
  );
});
