# CV Adaptation Implementation Plan

> **Para agentes:** Leia `docs/superpowers/specs/2026-04-04-cv-adaptation-design.md` ANTES de executar qualquer tarefa. O spec define o modelo de domínio, contratos de API, shapes de DTO, regras de negócio e a regra inegociável de não inventar dados de carreira.

**Goal:** Build the full CV adaptation feature: multi-version management, template selection, AI integration with payment gate, PDF delivery, and user history management.

**Tech Stack:** NestJS, Prisma, Next.js App Router, TypeScript, Node test runner, OpenAI-compatible client, Mercado Pago (primary payment), S3/MinIO storage, Puppeteer (PDF generation)

---

### Task 1: Add `CvAdaptation` to the database schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_cv_adaptation/migration.sql`
- Modify: `packages/database/src/schema.spec.ts`

- [ ] **Step 1: Write failing schema assertions**

Add to `packages/database/src/schema.spec.ts`:

```ts
test("CvAdaptation model exists with all required fields and enums", () => {
  const cvAdaptation = getBlock("model", "CvAdaptation");
  const enums = schemaText; // full schema text

  // Status enum
  assert.match(enums, /enum CvAdaptationStatus \{/);
  assert.match(enums, /awaiting_payment/);
  assert.match(enums, /delivered/);

  // Payment enums
  assert.match(enums, /enum PaymentStatus \{/);
  assert.match(enums, /enum PaymentProvider \{/);
  assert.match(enums, /mercadopago/);

  // Model fields
  assert.match(cvAdaptation, /userId\s+String/);
  assert.match(cvAdaptation, /masterResumeId\s+String/);
  assert.match(cvAdaptation, /jobDescriptionText\s+String/);
  assert.match(cvAdaptation, /adaptedContentJson\s+Json\?/);
  assert.match(cvAdaptation, /previewText\s+String\?/);
  assert.match(cvAdaptation, /adaptedResumeId\s+String\?/);
  assert.match(cvAdaptation, /paymentStatus\s+PaymentStatus/);
  assert.match(cvAdaptation, /paymentReference\s+String\?/);
  assert.match(cvAdaptation, /paidAt\s+DateTime\?/);

  // ResumeTemplate gets previewImageUrl
  const template = getBlock("model", "ResumeTemplate");
  assert.match(template, /previewImageUrl\s+String\?/);
});
```

- [ ] **Step 2: Run schema test to confirm it fails**

```bash
npm run test --workspace @earlycv/database -- src/schema.spec.ts
```

Expected: FAIL (model and enums don't exist yet)

- [ ] **Step 3: Add enums, model fields, and back-relations to schema.prisma**

Following the spec exactly:
- Add `CvAdaptationStatus`, `PaymentStatus`, `PaymentProvider` enums
- Add `CvAdaptation` model with all fields, indexes, and relations
- Add `cvAdaptationsAsMaster` and `cvAdaptationAsResult` to `Resume`
- Add `cvAdaptations` to `ResumeTemplate` and `User`
- Add `previewImageUrl String?` to `ResumeTemplate`

- [ ] **Step 4: Create migration SQL file**

Create file at `packages/database/prisma/migrations/<timestamp>_add_cv_adaptation/migration.sql` with the SQL from the spec.

- [ ] **Step 5: Regenerate Prisma client and run schema tests**

```bash
npm run generate --workspace @earlycv/database && npm run test --workspace @earlycv/database -- src/schema.spec.ts
```

Expected: PASS

---

### Task 2: Extend `packages/ai` with CV adaptation flow and PDF parser

**Files:**
- Create: `packages/ai/src/cv-adaptation.ts`
- Create: `packages/ai/src/pdf-parser.ts`
- Create: `packages/ai/src/cv-adaptation.spec.ts`
- Create: `packages/ai/src/pdf-parser.spec.ts`
- Modify: `packages/ai/src/index.ts` (export new functions and types)
- Modify: `packages/ai/package.json` (add `pdf-parse` dependency)

- [ ] **Step 1: Write failing unit tests for the CV adaptation flow**

Create `packages/ai/src/cv-adaptation.spec.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

describe("adaptCv", () => {
  it("returns a valid CvAdaptationOutput shape when AI responds correctly", async () => {
    // Mock OpenAI client to return a pre-built JSON fixture
    // Call adaptCv with minimal masterCvText and jobDescriptionText
    // Assert output.summary is a non-empty string
    // Assert output.sections is an array
    // Assert output.highlightedSkills is an array
    // Assert audit.traceId is a string
  });

  it("throws when AI returns malformed JSON", async () => {
    // Mock OpenAI to return non-JSON string
    // Assert adaptCv throws with a descriptive error
  });
});
```

Run: `npm run test --workspace @earlycv/ai -- src/cv-adaptation.spec.ts`
Expected: FAIL (file doesn't exist)

- [ ] **Step 2: Write failing unit test for PDF parser**

Create `packages/ai/src/pdf-parser.spec.ts`:

```ts
it("extracts plain text from a valid PDF buffer", async () => {
  // Load a minimal fixture PDF from test/fixtures/sample.pdf
  // Assert returned string contains expected text
});

it("throws on an unreadable/empty buffer", async () => {
  // Pass empty Buffer
  // Assert throws
});
```

Run: `npm run test --workspace @earlycv/ai -- src/pdf-parser.spec.ts`
Expected: FAIL

- [ ] **Step 3: Add `pdf-parse` to packages/ai and install**

In `packages/ai/package.json`, add:
```json
"dependencies": {
  "pdf-parse": "^1.1.1"
},
"devDependencies": {
  "@types/pdf-parse": "^1.1.4"
}
```

Run: `npm install` from root.

Also create `packages/ai/test/fixtures/sample.pdf` — a minimal valid PDF with known text content for testing.

- [ ] **Step 4: Implement `pdf-parser.ts`**

```ts
import pdfParse from "pdf-parse";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("PDF buffer is empty or unreadable");
  }
  const data = await pdfParse(buffer);
  const text = data.text.trim();
  if (!text) {
    throw new Error("PDF contains no extractable text");
  }
  return text;
}
```

- [ ] **Step 5: Implement `cv-adaptation.ts`**

Define `CvAdaptationInput`, `CvAdaptationOutput`, `CvSection`, `CvSectionItem` types.

Write the system prompt as a constant. The prompt must:
1. Explicitly state the no-fabrication rule
2. Instruct the model to return only valid JSON matching `CvAdaptationOutput`
3. Include the JSON schema in the prompt

Implement `adaptCv`:

```ts
export async function adaptCv(
  client: OpenAI,
  model: string,
  input: CvAdaptationInput,
): Promise<{ output: CvAdaptationOutput; audit: AIAuditRecord }> {
  // Build user message combining input fields
  // Call client.chat.completions.create with system prompt + user message
  // Parse response as JSON
  // Validate shape (throw if required fields missing)
  // Build AIAuditRecord
  // Return { output, audit }
}
```

- [ ] **Step 6: Export new functions and types from index.ts**

Add to `packages/ai/src/index.ts`:
```ts
export { adaptCv } from "./cv-adaptation.js";
export { extractTextFromPdf } from "./pdf-parser.js";
export type { CvAdaptationInput, CvAdaptationOutput, CvSection, CvSectionItem } from "./cv-adaptation.js";
```

- [ ] **Step 7: Run all ai package tests**

```bash
npm run test --workspace @earlycv/ai
```

Expected: PASS

---

### Task 3: Add `resume-templates` public listing endpoint

**Files:**
- Modify: `apps/api/src/resume-templates/resume-templates.controller.ts`
- Modify: `apps/api/src/resume-templates/resume-templates.service.ts`
- Modify: `apps/api/src/resume-templates/dto/` (add response DTO if missing)
- Modify: `apps/api/src/resume-templates/resume-templates.e2e-spec.ts`

- [ ] **Step 1: Write failing test for public template listing**

In `resume-templates.e2e-spec.ts`:

```ts
test("GET /resume-templates returns active templates without auth", async () => {
  // Seed 2 active templates and 1 inactive
  // GET /resume-templates (no auth header)
  // Assert response contains 2 templates
  // Assert each has: id, name, slug, description, targetRole, previewImageUrl
  // Assert inactive template is not in results
});
```

Run: `npm run test --workspace @earlycv/api -- src/resume-templates/resume-templates.e2e-spec.ts`
Expected: FAIL

- [ ] **Step 2: Add public listing endpoint**

In `resume-templates.service.ts`:
```ts
listActive() {
  return this.database.resumeTemplate.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, description: true, targetRole: true, previewImageUrl: true, fileUrl: true },
  });
}
```

In `resume-templates.controller.ts`:
- Add `GET /resume-templates` without auth guard
- Return `listActive()` result

- [ ] **Step 3: Add initial template seed**

In `packages/database/prisma/seed.ts` (or equivalent), upsert 3 templates:

```ts
const templates = [
  { name: "Clássico", slug: "classico", description: "Layout limpo e direto, otimizado para ATS", targetRole: "Geral", isActive: true },
  { name: "Moderno", slug: "moderno", description: "Duas colunas com hierarquia visual", targetRole: "Tech & Produto", isActive: true },
  { name: "Executivo", slug: "executivo", description: "Compacto e denso, ideal para cargos sêniores", targetRole: "Liderança", isActive: true },
];
// upsert by slug
```

- [ ] **Step 4: Run template tests**

```bash
npm run test --workspace @earlycv/api -- src/resume-templates/resume-templates.e2e-spec.ts
```

Expected: PASS

---

### Task 4: Build the `cv-adaptation` NestJS module — core CRUD

**Files:**
- Create: `apps/api/src/cv-adaptation/cv-adaptation.module.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Create: `apps/api/src/cv-adaptation/dto/create-cv-adaptation.dto.ts`
- Create: `apps/api/src/cv-adaptation/dto/cv-adaptation-response.dto.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing e2e tests for basic CRUD**

Create `cv-adaptation.e2e-spec.ts`:

```ts
describe("CvAdaptation CRUD", () => {
  let userId: string;
  let masterResumeId: string;

  beforeEach(async () => {
    // Create a user and a master Resume with rawText
  });

  test("POST /cv-adaptation with masterResumeId creates an adaptation", async () => {
    const res = await request(app.getHttpServer())
      .post("/cv-adaptation")
      .set("Authorization", `Bearer ${token}`)
      .send({ masterResumeId, jobDescriptionText: "Engenheiro de dados..." });
    assert.equal(res.status, 201);
    assert.equal(res.body.masterResumeId, masterResumeId);
    assert.ok(!("adaptedContentJson" in res.body)); // never exposed
  });

  test("POST /cv-adaptation with wrong masterResumeId returns 404", async () => {
    // Use a masterResumeId belonging to another user
    assert.equal(res.status, 404);
  });

  test("GET /cv-adaptation returns only the current user's adaptations", async () => {
    // Create adaptation for user A and user B
    // GET as user A returns only user A's adaptations
  });

  test("GET /cv-adaptation/:id returns 404 for another user's adaptation", async () => {});

  test("GET /cv-adaptation/:id never includes adaptedContentJson", async () => {
    // Create adaptation in awaiting_payment status with adaptedContentJson set
    // GET returns response without adaptedContentJson key
  });

  test("DELETE /cv-adaptation/:id deletes the record", async () => {
    // Create adaptation
    // DELETE
    // Assert 204
    // Assert GET returns 404
  });

  test("DELETE /cv-adaptation/:id also deletes the adaptedResume if present", async () => {
    // Create adaptation with adaptedResumeId linked
    // DELETE
    // Assert the adapted Resume no longer exists
  });
});
```

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 2: Implement `CreateCvAdaptationDto`**

```ts
import { IsOptional, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

export class CreateCvAdaptationDto {
  @IsOptional() @IsString() masterResumeId?: string;
  @IsString() @MaxLength(8000) @Transform(({ value }) => value?.trim()) jobDescriptionText: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(({ value }) => value?.trim()) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) @Transform(({ value }) => value?.trim()) companyName?: string;
  @IsOptional() @IsString() templateId?: string;
}
```

- [ ] **Step 3: Implement `CvAdaptationService` (CRUD only, no AI yet)**

```ts
async create(userId: string, dto: CreateCvAdaptationDto): Promise<CvAdaptation>
// - If masterResumeId provided: verify ownership (throw NotFoundException if not found/not owned)
// - Create CvAdaptation with status: pending
// - Do NOT trigger AI here yet (Task 5 adds AI)

async list(userId: string, page: number, limit: number): Promise<{ items: CvAdaptation[]; total: number }>

async getById(userId: string, id: string): Promise<CvAdaptation>
// Throws NotFoundException if not found or not owned

async delete(userId: string, id: string): Promise<void>
// 1. Load adaptation (verify ownership)
// 2. If adaptedResumeId: delete Resume
// 3. Delete CvAdaptation record
// 4. (Storage cleanup comes in Task 7)
```

- [ ] **Step 4: Implement `CvAdaptationController`**

```ts
@Controller("cv-adaptation")
@UseGuards(JwtAuthGuard)
export class CvAdaptationController {
  @Post() create(@CurrentUser() user, @Body() dto: CreateCvAdaptationDto)
  @Get() list(@CurrentUser() user, @Query("page") page, @Query("limit") limit)
  @Get(":id") getById(@CurrentUser() user, @Param("id") id)
  @Delete(":id") delete(@CurrentUser() user, @Param("id") id)
}
```

`CvAdaptationResponseDto` mapping: strip `adaptedContentJson` from all responses.

- [ ] **Step 5: Register in AppModule**

Add `CvAdaptationModule` to `apps/api/src/app.module.ts`.

- [ ] **Step 6: Run CRUD e2e tests**

```bash
npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts
```

Expected: All CRUD tests PASS (AI tests in Step 5 still pending)

---

### Task 5: AI integration — analyze and adapt

**Files:**
- Create: `apps/api/src/cv-adaptation/cv-adaptation-ai.service.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation-ai.service.spec.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`

- [ ] **Step 1: Write failing unit test for AI service**

Create `cv-adaptation-ai.service.spec.ts`:

```ts
describe("CvAdaptationAiService", () => {
  it("calls adaptCv and updates adaptation to awaiting_payment on success", async () => {
    // Mock OpenAI client and DatabaseService
    // Create a CvAdaptation stub in status: pending
    // Call analyzeAndAdapt(adaptation, "Engineer with 5 years...")
    // Assert DatabaseService.cvAdaptation.update called with status: awaiting_payment
    // Assert adaptedContentJson stored
    // Assert previewText = first 200 chars of summary
  });

  it("updates adaptation to failed when AI throws", async () => {
    // Mock OpenAI to throw
    // Assert status set to failed, failureReason set
  });
});
```

Run: `npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation-ai.service.spec.ts`
Expected: FAIL

- [ ] **Step 2: Implement `CvAdaptationAiService`**

```ts
@Injectable()
export class CvAdaptationAiService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AI_CLIENT_TOKEN) private readonly aiClient: OpenAI,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async analyzeAndAdapt(adaptation: CvAdaptation, masterCvText: string): Promise<void> {
    await this.database.cvAdaptation.update({
      where: { id: adaptation.id },
      data: { status: "analyzing" },
    });

    try {
      const { output, audit } = await adaptCv(this.aiClient, this.config.get("OPENAI_MODEL"), {
        masterCvText,
        jobDescriptionText: adaptation.jobDescriptionText,
        jobTitle: adaptation.jobTitle ?? undefined,
        companyName: adaptation.companyName ?? undefined,
      });

      const previewText = output.summary.slice(0, 200);

      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          status: "awaiting_payment",
          adaptedContentJson: output as unknown as Prisma.InputJsonValue,
          previewText,
          aiAuditJson: audit as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      await this.database.cvAdaptation.update({
        where: { id: adaptation.id },
        data: {
          status: "failed",
          failureReason: error instanceof Error ? error.message : "Unknown AI error",
        },
      });
    }
  }
}
```

- [ ] **Step 3: Wire AI call into `CvAdaptationService.create()`**

After creating the `CvAdaptation` record in `create()`:
1. Load `masterResume.rawText`
2. If `rawText` is null: throw `BadRequestException("CV has no extracted text. Please re-upload.")`
3. Call `this.aiService.analyzeAndAdapt(adaptation, masterResume.rawText)` — **synchronously for MVP**
4. Return the adaptation after AI completes (re-fetch to get updated status)

- [ ] **Step 4: Add AI flow e2e test to the spec**

Add to `cv-adaptation.e2e-spec.ts`:

```ts
test("POST /cv-adaptation triggers AI and returns awaiting_payment status", async () => {
  // Seed master Resume with rawText = "Engenheiro de dados..."
  // Mock/stub AI call to return a fixture CvAdaptationOutput
  // POST /cv-adaptation
  // Assert response.status = "awaiting_payment"
  // Assert response.previewText is a non-empty string
});
```

- [ ] **Step 5: Run AI tests**

```bash
npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation-ai.service.spec.ts src/cv-adaptation/cv-adaptation.e2e-spec.ts
```

Expected: PASS

---

### Task 6: PDF upload for new CVs

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts` (new tests)
- Modify: `apps/api/src/resumes/resumes.service.ts` (add method to create from upload)

This task adds the alternative input path: user uploads a PDF instead of selecting an existing Resume.

- [ ] **Step 1: Write failing test for PDF upload path**

```ts
test("POST /cv-adaptation with multipart PDF creates a new master Resume and adaptation", async () => {
  // POST multipart/form-data with file + jobDescriptionText (no masterResumeId)
  // Assert 201
  // Assert a new Resume(kind: master) was created with rawText populated
  // Assert adaptation.masterResumeId references the new Resume
});

test("POST /cv-adaptation without file AND without masterResumeId returns 400", async () => {
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Add multipart handling to controller**

Use `@UseInterceptors(FileInterceptor("file"))` and `@UploadedFile()` from `@nestjs/platform-express`.

Configure `multer` with memoryStorage (keep file in memory as Buffer, then stream to S3).

Limit: 5 MB, accepted MIME types: `application/pdf`.

- [ ] **Step 3: Add PDF upload flow to service**

In `CvAdaptationService.create()`, when `file` is present:
1. Inject storage driver
2. Inject `extractTextFromPdf` from `packages/ai`
3. Extract text from PDF buffer
4. Upload buffer to S3: key = `cv-originals/{userId}/{newResumeId}/{original-filename}`
5. Create `Resume` (kind: master, status: uploaded, rawText, sourceFileUrl, sourceFileName)
6. Use the new `Resume.id` as `masterResumeId`

- [ ] **Step 4: Run upload tests**

```bash
npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts
```

Expected: PASS

---

### Task 7: Payment integration

**Files:**
- Create: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation-payment.service.spec.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts` (raw body middleware for webhooks)
- Modify: `.env.example`

- [ ] **Step 1: Write failing tests for checkout and webhook**

```ts
describe("Payment", () => {
  test("POST /cv-adaptation/:id/checkout creates payment intent and returns checkoutUrl", async () => {
    // Create adaptation in awaiting_payment status
    // Mock payment provider to return checkoutUrl = "https://mp.com/123"
    // POST /cv-adaptation/:id/checkout
    // Assert 200 and body.checkoutUrl contains "http"
    // Assert CvAdaptation.paymentStatus = pending
    // Assert CvAdaptation.paymentReference set
  });

  test("POST /cv-adaptation/:id/checkout returns 409 if not awaiting_payment", async () => {
    // Adaptation in status: analyzing
    // Assert 409
  });

  test("POST /cv-adaptation/webhook/mercadopago with valid signature updates to paid", async () => {
    // Seed adaptation with paymentReference = "mp-ext-123"
    // POST webhook with signed body
    // Assert adaptation.paymentStatus = completed
    // Assert adaptation.status = delivered (after PDF generated)
  });

  test("POST /cv-adaptation/webhook/mercadopago with invalid signature returns 400", async () => {
    assert.equal(res.status, 400);
  });
});
```

- [ ] **Step 2: Implement `CvAdaptationPaymentService`**

```ts
@Injectable()
export class CvAdaptationPaymentService {
  constructor(private readonly config: ConfigService) {}

  async createMercadoPagoIntent(adaptationId: string, userId: string): Promise<PaymentIntent> {
    // Call Mercado Pago Preferences API
    // Return { paymentReference, checkoutUrl, amountInCents, currency }
  }

  async createStripeIntent(adaptationId: string, userId: string): Promise<PaymentIntent> {
    // Call Stripe PaymentIntents API
    // Return { paymentReference, checkoutUrl, amountInCents, currency }
  }

  verifyMercadoPagoWebhook(rawBody: Buffer, headers: Record<string, string>): boolean {
    // Verify HMAC signature from Mercado Pago
  }

  verifyStripeWebhook(rawBody: Buffer, signature: string): boolean {
    // Verify Stripe webhook signature
  }

  resolvePaymentReference(provider: "mercadopago" | "stripe", body: unknown): string {
    // Extract external payment ID from webhook body
  }
}
```

- [ ] **Step 3: Add checkout and webhook endpoints to controller**

```ts
@Post(":id/checkout")
@UseGuards(JwtAuthGuard)
createCheckout(@CurrentUser() user, @Param("id") id)

@Post("webhook/:provider")
// No auth guard
// Raw body (configure express rawBody middleware in main.ts or app.module.ts for this route)
handleWebhook(@Param("provider") provider, @Req() req, @Headers() headers)
```

> **Critical:** Stripe and Mercado Pago webhooks require the raw request body (not parsed JSON) for signature verification. Configure NestJS to preserve rawBody for the `/cv-adaptation/webhook/*` route prefix.

- [ ] **Step 4: Add delivery pipeline to service**

When a webhook confirms payment:

```ts
async handlePaymentConfirmed(adaptationId: string): Promise<void> {
  // 1. Update CvAdaptation: paymentStatus = completed, paidAt = now, status = paid
  // 2. Reload adaptation with template relation
  // 3. Call pdfService.generateAdaptedPdf(adaptation, adaptedContentJson)
  // 4. Create Resume (kind: adapted, basedOnResumeId = masterResumeId, status: reviewed, sourceFileUrl = pdf.url)
  // 5. Update CvAdaptation: adaptedResumeId = newResume.id, status = delivered
}
```

- [ ] **Step 5: Add env vars to .env.example**

Add all payment env vars from the spec.

- [ ] **Step 6: Run payment tests**

```bash
npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts
```

Expected: PASS

---

### Task 8: PDF generation service

**Files:**
- Create: `apps/api/src/cv-adaptation/cv-adaptation-pdf.service.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation-pdf.service.spec.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.controller.ts` (add download endpoint)
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts` (add download method)
- Modify: `apps/api/package.json` (add puppeteer dependency)

- [ ] **Step 1: Write failing test for PDF generation**

```ts
describe("CvAdaptationPdfService", () => {
  it("generates a PDF buffer from CvAdaptationOutput", async () => {
    // Call generateAdaptedPdf with a fixture CvAdaptationOutput
    // Assert the result is a Buffer with length > 0
    // Assert content type is application/pdf
  });
});
```

- [ ] **Step 2: Install puppeteer**

In `apps/api/package.json`, add `puppeteer` as a dependency. Run `npm install`.

> Use `puppeteer` (not `puppeteer-core`) for MVP simplicity. It bundles Chromium.

- [ ] **Step 3: Implement `CvAdaptationPdfService`**

```ts
@Injectable()
export class CvAdaptationPdfService {
  async generateAdaptedPdf(output: CvAdaptationOutput, templateSlug?: string): Promise<Buffer> {
    // Build HTML string from output using a template function
    // Launch puppeteer, set HTML content, print to PDF
    // Close browser, return Buffer
  }

  private buildHtml(output: CvAdaptationOutput): string {
    // Returns a clean, ATS-safe HTML+CSS string
    // Sections: summary, experience, education, skills, certifications, etc.
    // Simple single-column layout for the default (classico) template
  }
}
```

The PDF must be clean and ATS-safe for the `classico` template (single column, no graphics).

- [ ] **Step 4: Wire PDF service into delivery pipeline in Task 7**

In `handlePaymentConfirmed()`:
1. Get `output = adaptation.adaptedContentJson as CvAdaptationOutput`
2. Call `pdfService.generateAdaptedPdf(output, adaptation.template?.slug)`
3. Upload Buffer to S3: key = `cv-adapted/{userId}/{adaptationId}/adapted.pdf`
4. Store `sourceFileUrl` on the new adapted Resume

- [ ] **Step 5: Add download endpoint**

```ts
@Get(":id/download")
@UseGuards(JwtAuthGuard)
async downloadPdf(@CurrentUser() user, @Param("id") id, @Res() res: Response) {
  // Load adaptation (verify ownership, verify paymentStatus = completed)
  // Stream PDF from S3 to response
  // Set headers: Content-Type: application/pdf, Content-Disposition: attachment; filename="cv-adaptado.pdf"
}
```

```ts
@Get(":id/content")
@UseGuards(JwtAuthGuard)
async getContent(@CurrentUser() user, @Param("id") id) {
  // Verify ownership and paymentStatus = completed
  // Return { adaptedContentJson }
}
```

- [ ] **Step 6: Run PDF tests**

```bash
npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation-pdf.service.spec.ts src/cv-adaptation/cv-adaptation.e2e-spec.ts
```

Expected: PASS

---

### Task 9: Frontend — upload page `/adaptar`

**Files:**
- Create: `apps/web/src/app/adaptar/page.tsx`
- Create: `apps/web/src/app/adaptar/layout.tsx`
- Create: `apps/web/src/lib/cv-adaptation-api.ts`
- Create: `apps/web/src/lib/resume-templates-api.ts`
- Create: `apps/web/src/components/ui/template-selector.tsx`

- [ ] **Step 1: Write failing test for API client**

Create `apps/web/src/lib/cv-adaptation-api.spec.ts`:

```ts
test("createCvAdaptation posts to /cv-adaptation with multipart data", async () => {
  // Mock fetch to return { id: "test-id", status: "analyzing" }
  // Call createCvAdaptation with a FormData containing file + jobDescriptionText
  // Assert fetch called with POST, /cv-adaptation, multipart
  // Assert returned dto.id = "test-id"
});

test("listCvAdaptations fetches page 1 by default", async () => {
  // Mock fetch
  // Call listCvAdaptations()
  // Assert URL includes /cv-adaptation?page=1
});
```

Run: `npx tsx --test apps/web/src/lib/cv-adaptation-api.spec.ts`
Expected: FAIL

- [ ] **Step 2: Implement `cv-adaptation-api.ts`**

All functions call `apiRequest()` (existing helper). Auth token injected from server session.

```ts
export async function createCvAdaptation(formData: FormData): Promise<CvAdaptationDto>
export async function getCvAdaptation(id: string): Promise<CvAdaptationDto>
export async function listCvAdaptations(page = 1, limit = 20): Promise<{ items: CvAdaptationDto[]; total: number }>
export async function createCheckoutIntent(id: string): Promise<{ checkoutUrl: string }>
export async function deleteCvAdaptation(id: string): Promise<void>
export async function getCvAdaptationContent(id: string): Promise<{ adaptedContentJson: CvAdaptationOutput }>
```

Add TypeScript types mirroring the API DTOs:
```ts
export type CvAdaptationStatus = "pending" | "analyzing" | "awaiting_payment" | "paid" | "delivered" | "failed";
export type PaymentStatus = "none" | "pending" | "completed" | "failed" | "refunded";
export type CvAdaptationDto = { id: string; status: CvAdaptationStatus; jobTitle: string | null; companyName: string | null; previewText: string | null; masterResumeId: string; templateId: string | null; template: { id: string; name: string; slug: string } | null; paymentStatus: PaymentStatus; paidAt: string | null; adaptedResumeId: string | null; createdAt: string; updatedAt: string; };
```

- [ ] **Step 3: Implement `resume-templates-api.ts`**

```ts
export type ResumeTemplateDto = { id: string; name: string; slug: string; description: string | null; targetRole: string | null; previewImageUrl: string | null; };
export async function listResumeTemplates(): Promise<ResumeTemplateDto[]>
```

- [ ] **Step 4: Implement `TemplateSelector` component**

`apps/web/src/components/ui/template-selector.tsx`:
- Props: `templates: ResumeTemplateDto[]`, `selected: string | null`, `onChange: (id: string) => void`
- Renders a grid of cards
- Each card: template name, targetRole chip, description, preview image (placeholder if no image)
- Selected card has accent border (laranja/terracota)
- Named export (no default export)

- [ ] **Step 5: Implement `/adaptar/page.tsx`**

Use `"use client"` — this is an interactive multi-step form.

Steps:
1. **Seu CV** — file dropzone (`accept=".pdf"` max 5 MB) OR select existing resume from API
2. **A vaga** — `<textarea>` for job description + optional `<input>` for jobTitle and companyName
3. **Template** — `<TemplateSelector>` loaded from `listResumeTemplates()` server call

On submit:
- Build `FormData` with file/masterResumeId + fields
- Call `createCvAdaptation(formData)`
- `router.push(`/adaptar/${adaptation.id}/resultado`)`

Add `metadata` with `robots: "noindex"`.

- [ ] **Step 6: Run web tests and check**

```bash
npx tsx --test apps/web/src/lib/cv-adaptation-api.spec.ts
npm run check --workspace @earlycv/web
```

Expected: PASS

---

### Task 10: Frontend — result page `/adaptar/[id]/resultado`

**Files:**
- Create: `apps/web/src/app/adaptar/[id]/resultado/page.tsx`
- Create: `apps/web/src/components/ui/adapted-cv-preview.tsx`
- Create: `apps/web/src/components/ui/payment-gate.tsx`
- Create: `apps/web/src/components/ui/cv-adaptation-status-badge.tsx`

- [ ] **Step 1: Write failing test for `adapted-cv-preview`**

Create `apps/web/src/components/ui/adapted-cv-preview.spec.ts` (using `@testing-library/react` if configured, or jsdom):

```ts
test("AdaptedCvPreview renders all section headings", () => {
  const output: CvAdaptationOutput = { /* fixture with 3 sections */ };
  const { getByText } = render(<AdaptedCvPreview output={output} />);
  assert.ok(getByText("Experiência"));
  assert.ok(getByText("Habilidades"));
});
```

- [ ] **Step 2: Implement `AdaptedCvPreview` component**

Props: `output: CvAdaptationOutput`
- Renders summary paragraph
- Renders each `CvSection` with a heading and `CvSectionItem` items
- Bullets as `<ul><li>` per item
- Named export

- [ ] **Step 3: Implement `PaymentGate` component**

Props: `price: string`, `onCheckout: () => void`, `isLoading: boolean`
- Overlay with blur backdrop (Tailwind `backdrop-blur-sm`, `opacity-50` on content below)
- Card on top with price, CTA button
- Named export

- [ ] **Step 4: Implement `CvAdaptationStatusBadge` component**

Props: `status: CvAdaptationStatus`
- Returns a styled `<span>` chip with color per status:
  - analyzing: blue
  - awaiting_payment: amber
  - delivered: green
  - failed: red
- Named export

- [ ] **Step 5: Implement `/adaptar/[id]/resultado/page.tsx`**

Use `"use client"`. Poll `getCvAdaptation(id)` every 3 seconds while `status === "analyzing"`.

State machine:
- `analyzing` → skeleton + spinner + "Adaptando seu CV..."
- `awaiting_payment` → show `previewText` + job info sidebar + `PaymentGate` overlay
- `paid` or `delivered` → `AdaptedCvPreview` with full content (from `getCvAdaptationContent()`) + download button
- `failed` → error card with retry link to `/adaptar`

On "Desbloquear" click: `router.push(`/adaptar/${id}/checkout`)`

- [ ] **Step 6: Run web checks**

```bash
npm run check --workspace @earlycv/web
```

Expected: PASS

---

### Task 11: Frontend — checkout and confirmation pages

**Files:**
- Create: `apps/web/src/app/adaptar/[id]/checkout/page.tsx`
- Create: `apps/web/src/app/adaptar/[id]/confirmacao/page.tsx`

- [ ] **Step 1: Implement checkout page**

Server component. On load:
- Fetch adaptation (`getCvAdaptation(id)`) — if not `awaiting_payment`, redirect to `/adaptar/${id}/resultado`
- Call `createCheckoutIntent(id)` to get `checkoutUrl`
- For Mercado Pago: `redirect(checkoutUrl)` (server-side redirect)
- For Stripe: render Stripe Elements inline

Show job title + price in the page header before redirect.
Metadata: `noindex`.

- [ ] **Step 2: Implement confirmation page**

Use `"use client"`. Poll `getCvAdaptation(id)` every 3s until `status === "delivered"`.

- While polling: "Confirmando pagamento e gerando seu CV..."
- When delivered: "Seu CV adaptado está pronto!" + download button + link to `/meus-cvs`
- Metadata: `noindex`

---

### Task 12: Frontend — history page `/meus-cvs`

**Files:**
- Create: `apps/web/src/app/meus-cvs/page.tsx`

- [ ] **Step 1: Implement `/meus-cvs/page.tsx`**

Server component with client island for delete action.

- Load `listCvAdaptations()` server-side
- Render cards per adaptation:
  - `CvAdaptationStatusBadge`
  - Job title (or "Sem título" if null)
  - Company name
  - Template name
  - Created date (formatted as `dd/MM/yyyy`)
  - "Ver resultado" link
  - "Baixar PDF" link (only if `paymentStatus === completed`)
  - "Excluir" button — confirms with a native `confirm()` dialog, calls `deleteCvAdaptation(id)`, reloads list
- Empty state: "Você ainda não adaptou nenhum CV. Comece agora →" (link to `/adaptar`)
- Tabs or filter buttons: "Todos" | "Entregues" | "Aguardando pagamento"
- Metadata: `noindex`

- [ ] **Step 2: Run web checks**

```bash
npm run check --workspace @earlycv/web
```

Expected: PASS

---

### Task 13: Final verification

- [ ] **Step 1: Run all targeted API tests**

```bash
npm run test --workspace @earlycv/api -- src/cv-adaptation/cv-adaptation.e2e-spec.ts src/cv-adaptation/cv-adaptation-ai.service.spec.ts src/cv-adaptation/cv-adaptation-pdf.service.spec.ts src/cv-adaptation/cv-adaptation-payment.service.spec.ts src/resume-templates/resume-templates.e2e-spec.ts
```

Expected: PASS

- [ ] **Step 2: Run full API test suite**

```bash
npm run test --workspace @earlycv/api
```

Expected: PASS

- [ ] **Step 3: Run database test suite**

```bash
npm run test --workspace @earlycv/database
```

Expected: PASS

- [ ] **Step 4: Run AI package test suite**

```bash
npm run test --workspace @earlycv/ai
```

Expected: PASS

- [ ] **Step 5: Run API lint/type checks**

```bash
npm run check --workspace @earlycv/api
```

Expected: PASS

- [ ] **Step 6: Run web lint/type checks**

```bash
npm run check --workspace @earlycv/web
```

Expected: PASS

- [ ] **Step 7: Run web build**

```bash
npm run build --workspace @earlycv/web
```

Expected: PASS

- [ ] **Step 8: Run Prisma generate to confirm no drift**

```bash
npm run generate --workspace @earlycv/database
```

Expected: PASS (no changes)
