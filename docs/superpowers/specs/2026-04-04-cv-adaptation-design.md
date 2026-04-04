# CV Adaptation Feature Design

## Context

EarlyCV's core product value is adapting a user's CV for a specific job opening without inventing any career facts. This document specifies the full architecture for the CV adaptation feature, including multi-version management, template selection, AI integration, payment gate, and PDF delivery.

The schema already has `Resume` (with `kind: adapted`, `basedOnResumeId`, `templateId`) and `ResumeTemplate`. The backend has `packages/ai` (OpenAI client) and `packages/storage` (S3/MinIO driver interface). The payment layer does not exist yet.

---

## Product Rules (non-negotiable)

- AI must **never** add experiences, skills, certifications, titles, or accomplishments not present in the user's original PDF.
- The AI may reorganize, rephrase, reorder, emphasize, and remove content — never invent.
- The adapted result is gated behind payment. Before payment, only a partial/blurred preview is shown.
- Deleting an adaptation deletes its stored files (PDF, rawText). The master CV (`Resume` with `kind: master`) is never deleted as a side effect.
- `firstSeenAt` and `canonicalKey` invariants are for `Job` only — they do not apply here.

---

## Domain Model

### Entities and their responsibilities

```
User
  └── Resume (kind: master)         ← uploaded source CV, rawText parsed
  └── Resume (kind: adapted)        ← final adapted CV document, linked to CvAdaptation
  └── CvAdaptation                  ← the adaptation process and its lifecycle
        ├── masterResumeId          → Resume (kind: master)
        ├── templateId              → ResumeTemplate
        ├── jobDescriptionText      ← free-text paste from user
        └── adaptedResumeId         → Resume (kind: adapted), set after payment

ResumeTemplate                      ← platform-provided templates (admin managed)
```

### Lifecycle of a CvAdaptation

```
pending → analyzing → awaiting_payment → paid → delivered
                   └→ failed
```

- **pending**: user submitted PDF + job description, upload in progress
- **analyzing**: AI is processing
- **awaiting_payment**: AI result stored, preview unlocked, waiting for user to pay
- **paid**: payment confirmed by webhook
- **delivered**: adapted Resume record created, PDF generated and stored, downloadable
- **failed**: unrecoverable error in AI step

### Payment lifecycle

```
none → pending → completed
               └→ failed
               └→ refunded
```

---

## Schema Changes

### New model: `CvAdaptation`

```prisma
enum CvAdaptationStatus {
  pending
  analyzing
  awaiting_payment
  paid
  delivered
  failed
}

enum PaymentStatus {
  none
  pending
  completed
  failed
  refunded
}

enum PaymentProvider {
  mercadopago
  stripe
}

model CvAdaptation {
  id                   String              @id @default(cuid())
  userId               String
  masterResumeId       String
  templateId           String?
  jobDescriptionText   String
  jobTitle             String?
  companyName          String?
  status               CvAdaptationStatus  @default(pending)
  adaptedContentJson   Json?               // AI output, stored always, gated in API response
  previewText          String?             // first ~200 chars of adapted summary, always visible
  adaptedResumeId      String?             @unique
  aiAuditJson          Json?               // model, tokens, traceId
  paymentStatus        PaymentStatus       @default(none)
  paymentProvider      PaymentProvider?
  paymentReference     String?             @unique
  paymentAmountInCents Int?
  paymentCurrency      String?             @default("BRL")
  paidAt               DateTime?
  failureReason        String?
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  user          User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  masterResume  Resume          @relation("CvAdaptationMaster", fields: [masterResumeId], references: [id], onDelete: Cascade)
  template      ResumeTemplate? @relation(fields: [templateId], references: [id], onDelete: SetNull)
  adaptedResume Resume?         @relation("CvAdaptationResult", fields: [adaptedResumeId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([masterResumeId])
  @@index([paymentReference])
}
```

### Changes to `Resume`

Add two back-relations for `CvAdaptation`:

```prisma
model Resume {
  // existing fields...
  cvAdaptationsAsMaster   CvAdaptation[] @relation("CvAdaptationMaster")
  cvAdaptationAsResult    CvAdaptation?  @relation("CvAdaptationResult")
}
```

### Changes to `ResumeTemplate`

Add back-relation:

```prisma
model ResumeTemplate {
  // existing fields...
  cvAdaptations CvAdaptation[]
}
```

### Changes to `User`

Add back-relation:

```prisma
model User {
  // existing fields...
  cvAdaptations CvAdaptation[]
}
```

### Migration SQL (approximate)

```sql
CREATE TYPE "CvAdaptationStatus" AS ENUM ('pending', 'analyzing', 'awaiting_payment', 'paid', 'delivered', 'failed');
CREATE TYPE "PaymentStatus" AS ENUM ('none', 'pending', 'completed', 'failed', 'refunded');
CREATE TYPE "PaymentProvider" AS ENUM ('mercadopago', 'stripe');

CREATE TABLE "CvAdaptation" (
  "id"                   TEXT NOT NULL,
  "userId"               TEXT NOT NULL,
  "masterResumeId"       TEXT NOT NULL,
  "templateId"           TEXT,
  "jobDescriptionText"   TEXT NOT NULL,
  "jobTitle"             TEXT,
  "companyName"          TEXT,
  "status"               "CvAdaptationStatus" NOT NULL DEFAULT 'pending',
  "adaptedContentJson"   JSONB,
  "previewText"          TEXT,
  "adaptedResumeId"      TEXT UNIQUE,
  "aiAuditJson"          JSONB,
  "paymentStatus"        "PaymentStatus" NOT NULL DEFAULT 'none',
  "paymentProvider"      "PaymentProvider",
  "paymentReference"     TEXT UNIQUE,
  "paymentAmountInCents" INTEGER,
  "paymentCurrency"      TEXT DEFAULT 'BRL',
  "paidAt"               TIMESTAMP(3),
  "failureReason"        TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CvAdaptation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_masterResumeId_fkey" FOREIGN KEY ("masterResumeId") REFERENCES "Resume"("id") ON DELETE CASCADE;
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ResumeTemplate"("id") ON DELETE SET NULL;
ALTER TABLE "CvAdaptation" ADD CONSTRAINT "CvAdaptation_adaptedResumeId_fkey" FOREIGN KEY ("adaptedResumeId") REFERENCES "Resume"("id") ON DELETE SET NULL;

CREATE INDEX "CvAdaptation_userId_createdAt_idx" ON "CvAdaptation"("userId", "createdAt");
CREATE INDEX "CvAdaptation_masterResumeId_idx" ON "CvAdaptation"("masterResumeId");
CREATE INDEX "CvAdaptation_paymentReference_idx" ON "CvAdaptation"("paymentReference");
```

---

## packages/ai — CV Adaptation Flow

### New file: `packages/ai/src/cv-adaptation.ts`

This module exports the AI orchestration for CV adaptation. It takes structured inputs and returns a structured adapted CV.

**Input shape:**

```ts
export type CvAdaptationInput = {
  masterCvText: string;        // full extracted text from the user's PDF
  jobDescriptionText: string;  // raw job description pasted by user
  jobTitle?: string;
  companyName?: string;
  templateHints?: string;      // optional formatting/structure hints from the template
};
```

**Output shape:**

```ts
export type CvAdaptationOutput = {
  summary: string;             // professional summary, adapted to the job
  sections: CvSection[];       // reordered/restructured sections
  highlightedSkills: string[]; // skills from master CV most relevant to job
  removedSections: string[];   // sections omitted for this adaptation (for transparency)
  adaptationNotes: string;     // brief explanation of what was changed and why
};

export type CvSection = {
  sectionType: "experience" | "education" | "skills" | "projects" | "certifications" | "languages" | "other";
  title: string;
  items: CvSectionItem[];
};

export type CvSectionItem = {
  heading: string;
  subheading?: string;
  dateRange?: string;
  bullets: string[];
};
```

**System prompt contract:**

The system prompt must explicitly forbid fabrication. It must instruct the model to:
1. Read the CV carefully and identify all factual claims
2. Reorder and rephrase to match the job description
3. Remove irrelevant sections to reduce noise
4. Never add a skill, technology, title, certification, or achievement not in the original
5. Return a valid JSON object matching `CvAdaptationOutput`

**Function signature:**

```ts
export async function adaptCv(
  client: OpenAI,
  model: string,
  input: CvAdaptationInput,
): Promise<{ output: CvAdaptationOutput; audit: AIAuditRecord }>;
```

### New file: `packages/ai/src/pdf-parser.ts`

Utility to extract plain text from a PDF buffer for AI input.

```ts
export async function extractTextFromPdf(buffer: Buffer): Promise<string>;
```

Use `pdf-parse` npm package. Returns plain text. Throws on unreadable PDF.

---

## packages/storage — Usage Pattern

The existing `StorageDriver` interface is sufficient. The API module will receive the driver via dependency injection.

**Storage key conventions:**

```
cv-originals/{userId}/{resumeId}/{filename}       ← uploaded master CV PDF
cv-adapted/{userId}/{adaptationId}/adapted.pdf    ← generated adapted CV PDF
```

---

## Backend: `cv-adaptation` Module

### Location

`apps/api/src/cv-adaptation/`

### Files

```
cv-adaptation/
  cv-adaptation.module.ts
  cv-adaptation.controller.ts
  cv-adaptation.service.ts
  cv-adaptation-ai.service.ts     ← AI orchestration
  cv-adaptation-payment.service.ts ← payment provider abstraction
  cv-adaptation-pdf.service.ts    ← PDF generation for adapted result
  dto/
    create-cv-adaptation.dto.ts
    cv-adaptation-response.dto.ts
    checkout-intent.dto.ts
    payment-webhook.dto.ts
  cv-adaptation.e2e-spec.ts
```

### Endpoints

#### `POST /cv-adaptation`

Creates a new adaptation request.

- Auth: required (JWT)
- Body: `multipart/form-data`
  - `file`: PDF file (max 5 MB)
  - `jobDescriptionText`: string (required, max 8000 chars)
  - `jobTitle`: string (optional)
  - `companyName`: string (optional)
  - `masterResumeId`: string (optional — if user selects existing master CV instead of uploading)
  - `templateId`: string (optional — selected template slug or id)
- Behavior:
  1. If `file` provided: upload to S3 at `cv-originals/{userId}/{resumeId}/...`, create `Resume` (kind: master, status: uploaded), extract text
  2. If `masterResumeId` provided: load existing Resume, verify ownership, use its `rawText`
  3. Create `CvAdaptation` record (status: pending)
  4. Enqueue AI analysis job (or call synchronously if queue not available — see note below)
  5. Return `CvAdaptation` with status `analyzing`
- Response: `CvAdaptationResponseDto` (no `adaptedContentJson` field — always omitted from API)

> **Note on async vs sync:** In MVP, execute AI inline (synchronous) during the request. If the call exceeds 30s, switch to a background queue using `packages/queue`. The service should be written so either mode works without changing the controller.

#### `GET /cv-adaptation`

Lists all adaptations for the authenticated user.

- Auth: required
- Query: `?page=1&limit=20` (default limit 20)
- Returns: paginated list of `CvAdaptationResponseDto`
- Never returns `adaptedContentJson`

#### `GET /cv-adaptation/:id`

Gets a single adaptation.

- Auth: required, ownership check
- Returns: `CvAdaptationResponseDto`
  - If `status` is `awaiting_payment`, `paid`, or `delivered`: include `previewText`
  - `adaptedContentJson` is NEVER returned here — only through the `/download` endpoint after payment

#### `POST /cv-adaptation/:id/checkout`

Creates a payment intent with the configured provider.

- Auth: required, ownership check
- Guards: adaptation must be in `awaiting_payment` status
- Behavior:
  1. Calculate price (hardcoded in config: `CV_ADAPTATION_PRICE_IN_CENTS`, default 2990 BRL)
  2. Call payment provider to create intent/preference
  3. Update `CvAdaptation.paymentStatus = pending`, store `paymentReference`
  4. Return checkout URL or client_secret for frontend to redirect/render

#### `POST /cv-adaptation/webhook/:provider`

Receives payment provider webhook. No auth (uses provider signature verification).

- Providers: `mercadopago`, `stripe`
- Behavior on payment confirmed:
  1. Verify webhook signature
  2. Find `CvAdaptation` by `paymentReference`
  3. Set `paymentStatus = completed`, `paidAt = now`, `status = paid`
  4. Trigger PDF generation (generate adapted CV PDF, store in S3)
  5. Create `Resume` (kind: adapted, basedOnResumeId, templateId, status: reviewed) linked to adaptation
  6. Set `CvAdaptation.adaptedResumeId`, `status = delivered`

#### `GET /cv-adaptation/:id/download`

Downloads the adapted CV PDF.

- Auth: required, ownership check
- Guard: `paymentStatus` must be `completed`
- Returns: binary PDF stream with `Content-Disposition: attachment; filename="cv-adaptado.pdf"`
- Streams directly from S3

#### `GET /cv-adaptation/:id/content`

Returns the full adapted content JSON (for web rendering before PDF download).

- Auth: required, ownership check
- Guard: `paymentStatus` must be `completed`
- Returns: `{ adaptedContentJson: CvAdaptationOutput }`

#### `DELETE /cv-adaptation/:id`

Deletes an adaptation.

- Auth: required, ownership check
- Behavior:
  1. Delete `CvAdaptation` record
  2. If `adaptedResumeId` exists: delete that `Resume` record
  3. Delete S3 objects: `cv-adapted/{userId}/{adaptationId}/...`
  4. Do NOT delete the master `Resume`
- Returns: 204

### DTOs

#### `CreateCvAdaptationDto`

```ts
export class CreateCvAdaptationDto {
  @IsOptional() @IsString() masterResumeId?: string;
  @IsString() @MaxLength(8000) jobDescriptionText: string;
  @IsOptional() @IsString() @MaxLength(200) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() templateId?: string;
}
```

#### `CvAdaptationResponseDto`

Maps `CvAdaptation` to a safe response shape. Never includes `adaptedContentJson`.

```ts
{
  id: string;
  status: CvAdaptationStatus;
  jobTitle: string | null;
  companyName: string | null;
  previewText: string | null;           // only when status >= awaiting_payment
  masterResumeId: string;
  templateId: string | null;
  template: { id; name; slug } | null; // joined
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  adaptedResumeId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### `CvAdaptationAiService`

Responsible only for orchestrating the AI call.

```ts
async analyzeAndAdapt(adaptation: CvAdaptation, masterCvText: string): Promise<{
  output: CvAdaptationOutput;
  previewText: string;
  audit: AIAuditRecord;
}>
```

- Calls `adaptCv()` from `packages/ai`
- On success: updates `CvAdaptation` → `{ status: awaiting_payment, adaptedContentJson, previewText, aiAuditJson }`
- On failure: updates `CvAdaptation` → `{ status: failed, failureReason }`
- `previewText` = first 200 characters of `output.summary`

### `CvAdaptationPaymentService`

Abstracts over payment providers.

```ts
interface PaymentIntent {
  paymentReference: string;  // external ID
  checkoutUrl: string;       // redirect URL for user
  amountInCents: number;
  currency: string;
}

async createIntent(adaptationId: string, userId: string): Promise<PaymentIntent>
async verifyMercadoPagoWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<boolean>
async verifyStripeWebhook(rawBody: Buffer, signature: string): Promise<boolean>
async resolvePaymentReference(provider: PaymentProvider, rawWebhookBody: unknown): Promise<string>
```

Configured via:
- `PAYMENT_PROVIDER`: `mercadopago` | `stripe` (default: `mercadopago`)
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CV_ADAPTATION_PRICE_IN_CENTS` (default: 2990)
- `CV_ADAPTATION_CURRENCY` (default: BRL)

### `CvAdaptationPdfService`

Generates the adapted CV PDF from `adaptedContentJson` and a template.

```ts
async generateAdaptedPdf(
  adaptation: CvAdaptation & { template: ResumeTemplate | null },
  output: CvAdaptationOutput,
): Promise<{ key: string; url: string }>
```

- Uses `puppeteer` (headless Chrome) or `@react-pdf/renderer` to render the CV
- Template determines layout/styling (use a default minimal template if no template selected)
- Uploads PDF to S3 at `cv-adapted/{userId}/{adaptationId}/adapted.pdf`
- Returns storage key and URL

> **MVP simplification:** For the first slice, use a single hardcoded default template rendered via a simple HTML+CSS string passed to puppeteer. Template-specific rendering can be layered in later.

---

## Backend: `resume-templates` Extension

### Endpoint additions

#### `GET /resume-templates` (public or authenticated)

Returns all active templates. Used by frontend to populate template selector.

- Auth: optional (public endpoint, `noindex`)
- Returns: `{ id, name, slug, description, targetRole, fileUrl, previewImageUrl }[]`

#### `GET /resume-templates/:slug` (public)

Returns a single template with full `structureJson` for preview.

### New field: `previewImageUrl`

Add to `ResumeTemplate` schema:

```prisma
model ResumeTemplate {
  // existing fields...
  previewImageUrl String?   // S3 URL to a preview thumbnail image
}
```

Migration:

```sql
ALTER TABLE "ResumeTemplate" ADD COLUMN "previewImageUrl" TEXT;
```

### Seed: initial templates

Add 3 initial templates to the database seed:

1. **Clássico** (`slug: classico`) — clean single-column layout, safe for ATS
2. **Moderno** (`slug: moderno`) — two-column with accent color, visual hierarchy
3. **Executivo** (`slug: executivo`) — compact, dense, suited for senior roles

Admin can add/deactivate templates via existing admin interface (extend resume-templates admin if needed).

---

## Backend: Module Registration

In `apps/api/src/app.module.ts`, add:

```ts
import { CvAdaptationModule } from "./cv-adaptation/cv-adaptation.module";

@Module({
  imports: [
    // existing modules...
    CvAdaptationModule,
  ],
})
```

### `CvAdaptationModule` imports

- `DatabaseModule` (or `DatabaseService` via shared)
- `ConfigModule` (for env vars: AI key, payment keys, storage config)
- `StorageModule` (inject the S3 driver)
- `AiModule` (inject OpenAI client)

---

## Backend: Environment Variables (add to `.env.example`)

```bash
# CV Adaptation
CV_ADAPTATION_PRICE_IN_CENTS=2990
CV_ADAPTATION_CURRENCY=BRL

# Payment provider selection
PAYMENT_PROVIDER=mercadopago

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=replace-me
MERCADOPAGO_WEBHOOK_SECRET=replace-me
MERCADOPAGO_SUCCESS_URL=http://localhost:3000/adaptar/{id}/confirmacao
MERCADOPAGO_FAILURE_URL=http://localhost:3000/adaptar/{id}/checkout

# Stripe (alternative)
STRIPE_SECRET_KEY=replace-me
STRIPE_WEBHOOK_SECRET=replace-me
STRIPE_SUCCESS_URL=http://localhost:3000/adaptar/{id}/confirmacao
STRIPE_CANCEL_URL=http://localhost:3000/adaptar/{id}/checkout
```

---

## Frontend: Pages and Routes

All routes under `/adaptar` and `/meus-cvs`.

### `/adaptar` — Upload page

**File:** `apps/web/src/app/adaptar/page.tsx`

**SEO:** `noindex` (authenticated flow, not public)

**Layout:**
- Step indicator (3 steps)
- **Step 1 — Seu CV:** drag-and-drop PDF upload OR select from existing master CVs (authenticated users see their saved CVs in a dropdown)
- **Step 2 — A vaga:** textarea for job description + optional fields (job title, company name)
- **Step 3 — Template:** grid of template cards with preview thumbnails, selectable
- CTA: "Analisar meu CV" → submits

**Behavior:**
- On submit: `POST /cv-adaptation` (multipart)
- Redirect to `/adaptar/[id]/resultado` with polling or loading state

### `/adaptar/[id]/resultado` — Result page

**File:** `apps/web/src/app/adaptar/[id]/resultado/page.tsx`

**SEO:** `noindex`

**States:**

1. `analyzing` — skeleton loader + "Estamos adaptando seu CV..." message, polls `GET /cv-adaptation/:id` every 3s
2. `awaiting_payment` — shows preview panel:
   - Adapted summary (from `previewText`) fully visible
   - Rest of CV blurred/locked behind payment gate
   - "Desbloquear resultado completo — R$ 29,90" CTA
   - Job description summary sidebar (title, company)
3. `paid` / `delivered`:
   - Full adapted CV rendered in web (sections, bullets)
   - "Baixar PDF" button → `GET /cv-adaptation/:id/download`
   - "Adaptar novamente" link → `/adaptar`
4. `failed` — error message with retry option

### `/adaptar/[id]/checkout` — Checkout page

**File:** `apps/web/src/app/adaptar/[id]/checkout/page.tsx`

**SEO:** `noindex`

- Calls `POST /cv-adaptation/:id/checkout`
- For Mercado Pago: redirects to `checkoutUrl`
- For Stripe: renders Stripe Elements inline
- Shows price, job title, company name from adaptation

### `/adaptar/[id]/confirmacao` — Confirmation page

**File:** `apps/web/src/app/adaptar/[id]/confirmacao/page.tsx`

**SEO:** `noindex`

- Polls adaptation status until `delivered`
- "Seu CV adaptado está pronto!" with download button
- Link to `/meus-cvs`

### `/meus-cvs` — History/management page

**File:** `apps/web/src/app/meus-cvs/page.tsx`

**SEO:** `noindex`

**Layout:**
- Tabs or filter: "Todos" | "Pagos" | "Aguardando pagamento"
- Card per adaptation:
  - Job title + company name
  - Date
  - Template used
  - Status badge (chip: "Processando", "Aguardando pagamento", "Entregue")
  - Actions:
    - `[Baixar PDF]` (if paid)
    - `[Ver resultado]` → `/adaptar/[id]/resultado`
    - `[Excluir]` → confirm modal → `DELETE /cv-adaptation/:id`
- Empty state: "Nenhuma adaptação ainda. Comece agora →"

---

## Frontend: API Client Functions

**File:** `apps/web/src/lib/cv-adaptation-api.ts`

```ts
// All functions are server-side (use session token)
export async function createCvAdaptation(formData: FormData): Promise<CvAdaptationDto>
export async function getCvAdaptation(id: string): Promise<CvAdaptationDto>
export async function listCvAdaptations(page?: number): Promise<{ items: CvAdaptationDto[]; total: number }>
export async function createCheckoutIntent(id: string): Promise<{ checkoutUrl: string }>
export async function deleteCvAdaptation(id: string): Promise<void>
export async function getCvAdaptationContent(id: string): Promise<{ adaptedContentJson: CvAdaptationOutput }>
```

**File:** `apps/web/src/lib/resume-templates-api.ts`

```ts
export async function listResumeTemplates(): Promise<ResumeTemplateDto[]>
```

---

## Frontend: Shared Components

**Files to create in `apps/web/src/components/ui/`:**

- `cv-adaptation-status-badge.tsx` — chip with color per status
- `template-selector.tsx` — grid of template cards with preview images, selectable
- `adapted-cv-preview.tsx` — renders `CvAdaptationOutput` as structured HTML (sections, bullets)
- `payment-gate.tsx` — blur overlay with CTA for locked content

---

## Testing Strategy

Follow TDD at all layers. Each task below has a "write failing test → implement → verify passing" cycle.

### Database layer

- Schema assertions in `packages/database/src/schema.spec.ts`:
  - `CvAdaptation` model exists with all required fields
  - All enums exist
  - Foreign key relations exist

### API layer (e2e specs)

- `cv-adaptation.e2e-spec.ts`:
  - POST with PDF creates adaptation and returns status `analyzing` or `awaiting_payment`
  - POST with invalid `masterResumeId` (wrong user) returns 403
  - GET list returns only current user's adaptations
  - GET single returns 404 for another user's adaptation
  - GET single never includes `adaptedContentJson`
  - GET /download returns 403 when `paymentStatus !== completed`
  - DELETE removes adaptation and its adapted Resume record
  - Webhook sets paymentStatus and triggers delivery pipeline

### AI service unit tests

- `cv-adaptation-ai.service.spec.ts` (mock OpenAI client):
  - Output matches `CvAdaptationOutput` shape
  - `previewText` is first 200 chars of summary
  - Failed OpenAI call sets adaptation to `failed`

### Capture-rule: no fabrication test

- A dedicated unit test that feeds a minimal CV and job description and asserts the output contains no keywords that were not in the input (basic smoke check for prompt integrity)

### Frontend

- `cv-adaptation-api.spec.ts` — mock fetch, verify correct URL, method, auth headers
- `adapted-cv-preview.spec.ts` — renders a fixture `CvAdaptationOutput` and asserts sections/bullets appear

---

## Success Criteria

- A user can upload a PDF CV, paste a job description, and receive an AI-adapted version.
- The adapted content is always gated until payment is confirmed.
- Paid users can download their adapted CV as PDF.
- Users can list, view, and delete their adaptation history.
- Admins can manage templates from the existing admin interface.
- The AI never invents career facts — enforced by prompt design and smoke-tested.
- All adapted CVs are linked to the user's `Resume` history (kind: adapted).
- Deleting an adaptation also deletes its associated adapted Resume and S3 files.
