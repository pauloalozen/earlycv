# Job Application Logical Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to logically delete a job application only when it is archived and has no unlocked CV adaptation; deleted applications must disappear from user-facing views while remaining in the database for traceability.

**Architecture:** Keep `archivedAt` and `deletedAt` as separate lifecycle dimensions. Add a guarded API action (`POST /job-applications/:id/delete`) that sets `deletedAt` after business-rule validation in the service. Update web list/detail UIs to expose `Excluir` only when eligible and refresh state after delete.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Vitest/Jest-style tests in existing monorepo patterns.

---

### Task 1: API contract and service guard for logical delete

**Files:**
- Modify: `apps/api/src/job-applications/job-applications.controller.ts`
- Modify: `apps/api/src/job-applications/job-applications.service.ts`
- Test: `apps/api/src/job-applications/job-applications.controller.spec.ts`
- Test: `apps/api/src/job-applications/job-applications.service.spec.ts`

- [ ] **Step 1: Write failing controller test for delete delegation**

```ts
test("delete/controller delegates with authenticated user", async () => {
  let captured: string[] = [];
  const service = makeServiceStub();
  service.delete = async (userId: string, id: string) => {
    captured = [userId, id];
    return { id };
  };

  const controller = new JobApplicationsController(service as never);
  const result = await controller.delete({ id: "user-1" }, "app-1");

  assert.equal(result.id, "app-1");
  assert.deepEqual(captured, ["user-1", "app-1"]);
});
```

- [ ] **Step 2: Run controller spec to verify fail**

Run: `npm run test --workspace @earlycv/api -- job-applications.controller.spec.ts`
Expected: FAIL with missing `delete` route/method.

- [ ] **Step 3: Add controller route for logical delete**

```ts
@Post(":id/delete")
delete(@AuthenticatedUser() user: { id: string }, @Param("id") id: string) {
  return this.service.delete(user.id, id);
}
```

- [ ] **Step 4: Write failing service tests for eligibility rules**

```ts
test("delete marks deletedAt when archived and no unlocked adaptation", async () => {
  // seed app archivedAt != null and no unlocked adaptation
  await service.delete("user-1", "app-eligible");
  const app = apps.get("app-eligible");
  assert.ok(app?.deletedAt instanceof Date);
});

test("delete rejects when application is not archived", async () => {
  await assert.rejects(
    () => service.delete("user-1", "app-active"),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message.includes("arquivada")
  );
});

test("delete rejects when there is unlocked adaptation", async () => {
  await assert.rejects(
    () => service.delete("user-1", "app-with-unlocked"),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message.includes("CV liberado")
  );
});
```

- [ ] **Step 5: Run service spec to verify fail**

Run: `npm run test --workspace @earlycv/api -- job-applications.service.spec.ts`
Expected: FAIL with missing `delete` service method/rules.

- [ ] **Step 6: Implement minimal guarded logical delete in service**

```ts
async delete(userId: string, id: string) {
  const application = await this.getByIdOrThrow(userId, id);

  if (application.archivedAt === null) {
    throw new ConflictException("A candidatura precisa estar arquivada para ser excluida.");
  }

  const hasUnlocked = await this.prisma.cvAdaptation.findFirst({
    where: { jobApplicationId: id, state: "unlocked" },
    select: { id: true },
  });

  if (hasUnlocked) {
    throw new ConflictException("Nao e possivel excluir candidatura com CV liberado.");
  }

  return this.prisma.jobApplication.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
```

- [ ] **Step 7: Re-run API tests to verify pass**

Run: `npm run test --workspace @earlycv/api -- job-applications.controller.spec.ts job-applications.service.spec.ts`
Expected: PASS for new delete coverage and existing archive/restore behavior.

- [ ] **Step 8: Commit API logical delete changes**

```bash
git add apps/api/src/job-applications/job-applications.controller.ts apps/api/src/job-applications/job-applications.service.ts apps/api/src/job-applications/job-applications.controller.spec.ts apps/api/src/job-applications/job-applications.service.spec.ts
git commit -m "feat(api): add guarded logical delete for archived applications"
```

### Task 2: Web API client support and list-card delete action

**Files:**
- Modify: `apps/web/src/lib/job-applications-api.ts`
- Modify: `apps/web/src/app/candidaturas/candidaturas-client.tsx`
- Test: `apps/web/src/app/candidaturas/candidaturas.test.tsx`

- [ ] **Step 1: Write failing list UI test for delete visibility rule**

```tsx
test("shows Excluir only for archived application without unlocked CV", async () => {
  renderWithArchivedCandidate({ archivedAt: "2026-01-01T00:00:00.000Z", bestCvState: "locked" });
  expect(screen.getByRole("button", { name: /Excluir/i })).toBeInTheDocument();
});

test("hides Excluir when archived application has unlocked CV", async () => {
  renderWithArchivedCandidate({ archivedAt: "2026-01-01T00:00:00.000Z", bestCvState: "unlocked" });
  expect(screen.queryByRole("button", { name: /Excluir/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run web list tests to verify fail**

Run: `npm run test --workspace @earlycv/web -- candidaturas.test.tsx`
Expected: FAIL because no delete action exists yet.

- [ ] **Step 3: Add delete API client function**

```ts
export async function deleteJobApplication(id: string): Promise<JobApplication> {
  const response = await apiRequest("POST", `/job-applications/${id}/delete`);
  return parseJobApplication(await response.json());
}
```

- [ ] **Step 4: Implement Excluir action in archived cards**

```tsx
const canDelete =
  application.archivedAt !== null && application.bestCvState !== "unlocked";

{canDelete ? (
  <button type="button" onClick={() => handleDelete(application.id)}>
    {deleting ? "Excluindo..." : "Excluir"}
  </button>
) : null}
```

- [ ] **Step 5: Remove item from archived list on delete success**

```ts
setArchivedApplications((current) =>
  current.filter((app) => app.id !== applicationId)
);
```

- [ ] **Step 6: Re-run list tests to verify pass**

Run: `npm run test --workspace @earlycv/web -- candidaturas.test.tsx`
Expected: PASS including delete eligibility rendering.

- [ ] **Step 7: Commit list delete UI/client changes**

```bash
git add apps/web/src/lib/job-applications-api.ts apps/web/src/app/candidaturas/candidaturas-client.tsx apps/web/src/app/candidaturas/candidaturas.test.tsx
git commit -m "feat(web): expose logical delete action for archived cards"
```

### Task 3: Detail page delete action and end-to-end behavior checks

**Files:**
- Modify: `apps/web/src/app/candidaturas/[id]/detail-client.tsx`
- Test: `apps/web/src/app/candidaturas/[id]/detail-client.test.tsx`

- [ ] **Step 1: Write failing detail test for conditional delete action**

```tsx
test("shows Excluir on detail only when archived and no unlocked CV", async () => {
  renderDetail({ archivedAt: "2026-01-01T00:00:00.000Z", bestCvState: "locked" });
  expect(screen.getByRole("button", { name: /Excluir/i })).toBeInTheDocument();
});

test("hides Excluir on detail when has unlocked CV", async () => {
  renderDetail({ archivedAt: "2026-01-01T00:00:00.000Z", bestCvState: "unlocked" });
  expect(screen.queryByRole("button", { name: /Excluir/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run detail tests to verify fail**

Run: `npm run test --workspace @earlycv/web -- detail-client.test.tsx`
Expected: FAIL because detail does not expose delete action.

- [ ] **Step 3: Implement detail Excluir action and redirect**

```tsx
const canDelete =
  application.archivedAt !== null && application.bestCvState !== "unlocked";

const handleDelete = async () => {
  await deleteJobApplication(application.id);
  router.push("/candidaturas?view=arquivadas");
  router.refresh();
};
```

- [ ] **Step 4: Re-run detail tests to verify pass**

Run: `npm run test --workspace @earlycv/web -- detail-client.test.tsx`
Expected: PASS for delete visibility and action flow.

- [ ] **Step 5: Commit detail delete UI changes**

```bash
git add apps/web/src/app/candidaturas/[id]/detail-client.tsx apps/web/src/app/candidaturas/[id]/detail-client.test.tsx
git commit -m "feat(web): add logical delete action on application detail"
```

### Task 4: Full verification for impacted scope

**Files:**
- Modify (if needed by failures): impacted files from Tasks 1-3

- [ ] **Step 1: Run API and web targeted tests together**

Run: `npm run test --workspace @earlycv/api -- job-applications.controller.spec.ts job-applications.service.spec.ts && npm run test --workspace @earlycv/web -- candidaturas.test.tsx detail-client.test.tsx`
Expected: PASS in all impacted suites.

- [ ] **Step 2: Run required project checks from AGENTS guidance**

Run: `npm run check && npm run generate --workspace @earlycv/database && npm run build && npm run test`
Expected: PASS, no regressions.

- [ ] **Step 3: Commit any final fixes from verification**

```bash
git add -A
git commit -m "test: cover logical delete guard and visibility rules"
```
