# Admin Eventos e Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma sessao `/admin/eventos-e-logs` que permita disparar eventos existentes (protection/business/all e unitario) para captura no PostHog com `metadata.synthetic = true`.

**Architecture:** Expor endpoints administrativos no `apps/api` para catalogo e emissao de eventos, reaproveitando os registries de versao existentes como fonte canonica. No `apps/web`, criar uma pagina admin com server actions que consomem esses endpoints e exibem resultados por evento. A emissao em lote deve continuar em sucesso parcial (falhas por item sem abortar todo o lote).

**Tech Stack:** NestJS (API), Next.js App Router (Web), TypeScript, Node test runner (`node:test`) e Vitest.

---

### Task 1: API catalog + emit service (dominio analysis-observability)

**Files:**
- Create: `apps/api/src/analysis-observability/admin-events-catalog.ts`
- Create: `apps/api/src/analysis-observability/admin-events-emitter.service.ts`
- Test: `apps/api/src/analysis-observability/admin-events-emitter.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

```ts
test("buildCatalog returns all protection and business events from registries", async () => {
  const service = new AdminEventsEmitterService(/* stubs */);
  const catalog = service.buildCatalog();

  assert.equal(catalog.protection.some((e) => e.eventName === "payload_valid"), true);
  assert.equal(catalog.business.some((e) => e.eventName === "page_view"), true);
});

test("emit single business event sends synthetic metadata", async () => {
  // assert metadata.synthetic === true in record(...) input
});

test("emit group protection processes all and returns partial failures", async () => {
  // one emit throws, verify failed count increments and others still sent
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/admin-events-emitter.service.spec.ts`

Expected: FAIL (arquivo/servico inexistente e asserts falhando).

- [ ] **Step 3: Implement minimal catalog constants and service**

```ts
// admin-events-catalog.ts
export type AdminObservableDomain = "protection" | "business";
export type AdminObservableEvent = { eventName: string; eventVersion: number };

export function buildAdminEventCatalog() {
  return {
    protection: Object.entries(ANALYSIS_PROTECTION_EVENT_VERSION_MAP).map(([eventName, eventVersion]) => ({ eventName, eventVersion })),
    business: Object.entries(BUSINESS_FUNNEL_EVENT_VERSION_MAP).map(([eventName, eventVersion]) => ({ eventName, eventVersion })),
  };
}
```

```ts
// admin-events-emitter.service.ts
async emit(input: { mode: "single" | "group" | "all"; eventName?: string; group?: "protection" | "business" }, context: AnalysisRequestContext) {
  // resolve targets from catalog
  // business -> businessFunnelEventService.record({ metadata: { synthetic: true }, ... }, context, ownerSource)
  // protection -> telemetry.emit(eventName, context, { metadata: { synthetic: true } })
  // collect sent/failed/results
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/admin-events-emitter.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analysis-observability/admin-events-catalog.ts apps/api/src/analysis-observability/admin-events-emitter.service.ts apps/api/src/analysis-observability/admin-events-emitter.service.spec.ts
git commit -m "feat(api): add admin event catalog and emitter service"
```

### Task 2: API DTO + controller + module wiring

**Files:**
- Create: `apps/api/src/analysis-observability/dto/emit-admin-events.dto.ts`
- Create: `apps/api/src/analysis-observability/admin-events.controller.ts`
- Modify: `apps/api/src/analysis-observability/analysis-observability.module.ts`
- Test: `apps/api/src/analysis-observability/admin-events.controller.spec.ts`

- [ ] **Step 1: Write failing controller tests**

```ts
test("admin events controller enforces admin/superadmin guards", () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, AdminEventsController) ?? [];
  const roles = Reflect.getMetadata(INTERNAL_ROLES_KEY, AdminEventsController) ?? [];
  assert.equal(guards.length >= 2, true);
  assert.deepEqual(roles, ["admin", "superadmin"]);
});

test("catalog returns protection and business arrays", async () => {
  const response = await controller.catalog();
  assert.equal(Array.isArray(response.protection), true);
});

test("emit forwards payload and context", async () => {
  // assert req.analysisContext is passed to service
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/admin-events.controller.spec.ts`

Expected: FAIL (controller inexistente).

- [ ] **Step 3: Implement controller + DTO + module registration**

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/analysis-observability/events")
export class AdminEventsController {
  @Get("catalog")
  catalog() { return this.adminEventsEmitterService.buildCatalog(); }

  @Post("emit")
  emit(@Req() req: AnalysisRequest, @Body(new ValidationPipe(...)) dto: EmitAdminEventsDto) {
    return this.adminEventsEmitterService.emit(dto, req.analysisContext);
  }
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/admin-events.controller.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analysis-observability/dto/emit-admin-events.dto.ts apps/api/src/analysis-observability/admin-events.controller.ts apps/api/src/analysis-observability/analysis-observability.module.ts apps/api/src/analysis-observability/admin-events.controller.spec.ts
git commit -m "feat(api): add admin observability catalog and emit endpoints"
```

### Task 3: Web API client for admin events

**Files:**
- Create: `apps/web/src/lib/admin-analysis-events-api.ts`
- Create: `apps/web/src/lib/admin-analysis-events-api.test.ts`

- [ ] **Step 1: Write failing client tests**

```ts
it("loads admin event catalog", async () => {
  const response = await listAdminAnalysisEventsCatalog("token-1");
  expect(response.business.some((e) => e.eventName === "page_view")).toBe(true);
});

it("posts emit payload to admin endpoint", async () => {
  await emitAdminAnalysisEvents({ mode: "group", group: "business" }, "token-1");
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringMatching(/\/admin\/analysis-observability\/events\/emit$/),
    expect.objectContaining({ method: "POST" }),
  );
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test:ui --workspace @earlycv/web -- src/lib/admin-analysis-events-api.test.ts`

Expected: FAIL (arquivo inexistente).

- [ ] **Step 3: Implement minimal client helpers**

```ts
export async function listAdminAnalysisEventsCatalog(token?: string) {
  return apiRequest<AdminEventsCatalogResponse>("/admin/analysis-observability/events/catalog", token);
}

export async function emitAdminAnalysisEvents(payload: EmitAdminEventsPayload, token?: string) {
  return apiRequest<EmitAdminEventsResponse>("/admin/analysis-observability/events/emit", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm run test:ui --workspace @earlycv/web -- src/lib/admin-analysis-events-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/admin-analysis-events-api.ts apps/web/src/lib/admin-analysis-events-api.test.ts
git commit -m "feat(web): add admin analysis events api client"
```

### Task 4: Admin page `/admin/eventos-e-logs`

**Files:**
- Create: `apps/web/src/app/admin/eventos-e-logs/page.tsx`
- Modify: `apps/web/src/lib/admin-users-operations.ts`
- Test: `apps/web/src/lib/admin-eventos-e-logs-navigation.spec.ts`

- [ ] **Step 1: Write failing page/navigation test**

```ts
test("admin nav includes eventos e logs entry", () => {
  const items = getAdminNavItems();
  assert.equal(items.some((item) => item.href === "/admin/eventos-e-logs"), true);
});

test("eventos e logs page wires catalog and emit actions", () => {
  const content = readFileSync(resolve(currentDir, "../app/admin/eventos-e-logs/page.tsx"), "utf8");
  assert.match(content, /listAdminAnalysisEventsCatalog/);
  assert.match(content, /emitAdminAnalysisEvents/);
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npm run test:spec --workspace @earlycv/web -- src/lib/admin-eventos-e-logs-navigation.spec.ts`

Expected: FAIL.

- [ ] **Step 3: Implement page and nav item**

```tsx
// page.tsx
type SearchParams = Promise<{ mode?: string; group?: string; eventName?: string }>;

export default async function AdminEventosELogsPage({ searchParams }: { searchParams: SearchParams }) {
  const token = await getBackofficeSessionToken();
  if (!token) return <AdminTokenState {...buildAdminStateModel("missing-token", "/admin/eventos-e-logs")} />;

  const catalog = await listAdminAnalysisEventsCatalog();
  const params = await searchParams;

  async function emitAction(formData: FormData) {
    "use server";
    const mode = String(formData.get("mode") ?? "single") as "single" | "group" | "all";
    const group = (formData.get("group") ? String(formData.get("group")) : undefined) as "protection" | "business" | undefined;
    const eventName = formData.get("eventName") ? String(formData.get("eventName")) : undefined;
    await emitAdminAnalysisEvents({ mode, group, eventName });
    revalidatePath("/admin/eventos-e-logs");
    redirect(`/admin/eventos-e-logs?mode=${mode}${group ? `&group=${group}` : ""}${eventName ? `&eventName=${eventName}` : ""}`);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <form action={emitAction}>
        <input name="mode" type="hidden" value="all" />
        <button type="submit">Disparar todos os eventos</button>
      </form>

      <section>
        <h2>Protecao</h2>
        <form action={emitAction}>
          <input name="mode" type="hidden" value="group" />
          <input name="group" type="hidden" value="protection" />
          <button type="submit">Disparar todos de protecao</button>
        </form>
        {catalog.protection.map((event) => (
          <form action={emitAction} key={event.eventName}>
            <input name="mode" type="hidden" value="single" />
            <input name="eventName" type="hidden" value={event.eventName} />
            <span>{event.eventName}</span>
            <button type="submit">Disparar evento</button>
          </form>
        ))}
      </section>

      <section>
        <h2>Business</h2>
        <form action={emitAction}>
          <input name="mode" type="hidden" value="group" />
          <input name="group" type="hidden" value="business" />
          <button type="submit">Disparar todos de business</button>
        </form>
        {catalog.business.map((event) => (
          <form action={emitAction} key={event.eventName}>
            <input name="mode" type="hidden" value="single" />
            <input name="eventName" type="hidden" value={event.eventName} />
            <span>{event.eventName}</span>
            <button type="submit">Disparar evento</button>
          </form>
        ))}
      </section>

      {params.mode ? <p>Ultima acao executada: {params.mode}</p> : null}
    </div>
  );
}
```

```ts
// admin-users-operations.ts
{ href: "/admin/eventos-e-logs", label: "Eventos e logs", phase: "fase 4" }
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npm run test:spec --workspace @earlycv/web -- src/lib/admin-eventos-e-logs-navigation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/eventos-e-logs/page.tsx apps/web/src/lib/admin-users-operations.ts apps/web/src/lib/admin-eventos-e-logs-navigation.spec.ts
git commit -m "feat(web): add admin eventos e logs page"
```

### Task 5: End-to-end verification and polish

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-admin-eventos-e-logs-design.md` (apenas se houver divergencia)

- [ ] **Step 1: Run targeted API tests**

Run: `npm run test --workspace @earlycv/api -- src/analysis-observability/admin-events-emitter.service.spec.ts src/analysis-observability/admin-events.controller.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run targeted Web tests**

Run: `npm run test --workspace @earlycv/web -- src/lib/admin-analysis-events-api.test.ts src/lib/admin-eventos-e-logs-navigation.spec.ts`

Expected: PASS.

- [ ] **Step 3: Run workspace checks for touched apps**

Run: `npm run check --workspace @earlycv/api && npm run check --workspace @earlycv/web`

Expected: PASS sem erros de type/lint.

- [ ] **Step 4: Manual smoke (local)**

Run app e validar:
- `/admin/eventos-e-logs` carrega catalogo.
- disparo unitario funciona para 1 evento business e 1 protection.
- disparo por grupo e global retornam resumo e falhas por item quando houver.

- [ ] **Step 5: Commit final de integracao**

```bash
git add -A
git commit -m "feat(admin): add synthetic observability event trigger tooling"
```
