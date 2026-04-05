# Admin CV Templates — Implementation Plan
_Data: 2026-04-05_

## Objetivo

Adicionar seção **"Templates de CV"** no painel admin (`/admin/templates`) para que usuários
com role `admin` ou `superadmin` possam criar, listar, editar e ativar/desativar templates
que aparecem na tela `/adaptar` dos usuários finais.

---

## Contexto e Convenções

### Endpoints de API já existentes (não criar nada novo no backend)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/resume-templates` | Lista todos (admin) |
| `POST` | `/api/admin/resume-templates` | Cria novo template |
| `PATCH` | `/api/admin/resume-templates/:id` | Atualiza campos |
| `POST` | `/api/admin/resume-templates/:id/toggle-status` | Alterna active/inactive |

### Padrões do admin existente (seguir rigorosamente)

- Páginas são **Server Components async** que usam `getBackofficeSessionToken()` para autenticar
- Se `!token`, retorna `<AdminTokenState>` com o modelo do `buildAdminStateModel()`
- Header de página usa `<AdminShellHeader eyebrow="admin / X" title="X" subtitle="..." actions={...} />`
- Listas usam `<Card>` com itens em `grid gap-4 xl:grid-cols-2`
- Estado vazio usa `<EmptyState title="..." description="..." />`
- Imports de UI: `import { buttonVariants, Badge, Card, EmptyState, Input } from "@/components/ui"`
- Formulários de criação usam **Server Actions** (não client components)
- `apiRequest` do `@/lib/api-request` para chamadas à API com o token da sessão
- Nav items ficam em `adminNavItems` array dentro de `apps/web/src/lib/admin-users-operations.ts`

---

## Arquivos a criar ou modificar

### 1. Modificar nav — `apps/web/src/lib/admin-users-operations.ts`

Adicionar ao array `adminNavItems` (após `{ href: "/admin/curriculos", ... }`):

```typescript
{ href: "/admin/templates", label: "Templates de CV" },
```

---

### 2. Criar lib de API admin — `apps/web/src/lib/admin-resume-templates-api.ts`

```typescript
"use server";

import { apiRequest } from "./api-request";

export type AdminResumeTemplateDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  targetRole: string | null;
  fileUrl: string | null;
  structureJson: Record<string, unknown> | null;
  status: string; // "active" | "inactive"
  createdAt: string;
  updatedAt: string;
};

export async function adminListResumeTemplates(): Promise<AdminResumeTemplateDto[]> {
  const response = await apiRequest("GET", "/admin/resume-templates");
  if (!response.ok) {
    throw new Error("Failed to fetch templates");
  }
  return response.json() as Promise<AdminResumeTemplateDto[]>;
}

export async function adminCreateResumeTemplate(data: {
  name: string;
  slug: string;
  description?: string;
  targetRole?: string;
  fileUrl?: string;
}): Promise<AdminResumeTemplateDto> {
  const response = await apiRequest("POST", "/admin/resume-templates", data);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create template: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}

export async function adminUpdateResumeTemplate(
  id: string,
  data: {
    name?: string;
    slug?: string;
    description?: string;
    targetRole?: string;
    fileUrl?: string;
  },
): Promise<AdminResumeTemplateDto> {
  const response = await apiRequest("PATCH", `/admin/resume-templates/${id}`, data);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update template: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}

export async function adminToggleResumeTemplateStatus(
  id: string,
): Promise<AdminResumeTemplateDto> {
  const response = await apiRequest(
    "POST",
    `/admin/resume-templates/${id}/toggle-status`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to toggle template status: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}
```

---

### 3. Criar página de lista — `apps/web/src/app/admin/templates/page.tsx`

Server Component. Busca templates via `adminListResumeTemplates()`. Exibe cada template
num `<Card>` com: nome, slug, status badge, descrição, targetRole e ações (Editar, Ativar/Desativar).

**Estrutura esperada:**

```
/admin/templates
├── AdminShellHeader
│   ├── eyebrow: "admin / templates de cv"
│   ├── title: "Templates de CV"
│   ├── subtitle: "Gerencie os templates disponíveis para adaptação de CV."
│   └── actions: <Link href="/admin/templates/novo">Novo template</Link>
├── EmptyState (se lista vazia)
│   ├── title: "Nenhum template cadastrado"
│   └── description: "Crie o primeiro template para ele aparecer na tela de adaptação."
└── Grid de Cards (xl:grid-cols-2) para cada template:
    ├── Nome (text-xl font-bold)
    ├── Slug (text-sm text-stone-500 font-mono)
    ├── Badge de status: "ativo" (verde) / "inativo" (cinza)
    ├── Descrição (se existir)
    ├── targetRole (se existir)
    └── Botões:
        ├── Link "Editar" → /admin/templates/[id]
        └── Form com Server Action para toggle-status ("Desativar" / "Ativar")
```

**Token guard** (igual às demais páginas):
```typescript
const token = await getBackofficeSessionToken();
if (!token) {
  return <AdminTokenState {...buildAdminStateModel("missing-token", "/admin/templates")} />;
}
```

**Tratamento de erro de fetch:**
```typescript
try {
  templates = await adminListResumeTemplates();
} catch {
  return <AdminTokenState {...buildAdminStateModel("fetch-error", "/admin/templates")} />;
}
```

**Badge de status:**
- `status === "active"` → `<Badge variant="accent">ativo</Badge>`
- `status === "inactive"` → `<Badge variant="neutral">inativo</Badge>`

**Toggle status** — Server Action inline na página (ou em `actions.ts`):
```typescript
async function toggleStatus(id: string) {
  "use server";
  await adminToggleResumeTemplateStatus(id);
  revalidatePath("/admin/templates");
}
```

---

### 4. Criar página de novo template — `apps/web/src/app/admin/templates/novo/page.tsx`

Server Component com formulário simples. Submissão via **Server Action**.

**Campos do formulário:**

| Campo | Input | Obrigatório | Validação |
|-------|-------|-------------|-----------|
| Nome | `<Input name="name" />` | ✅ | min 1, max 160 |
| Slug | `<Input name="slug" />` | ✅ | lowercase, hífens, min 3 |
| Descrição | `<textarea name="description" />` | ❌ | max 500 |
| Cargo alvo | `<Input name="targetRole" />` | ❌ | max 160 |
| URL do arquivo | `<Input name="fileUrl" type="url" />` | ❌ | URL válida |

**Server Action:**
```typescript
async function createTemplate(formData: FormData) {
  "use server";
  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string | undefined;
  const targetRole = formData.get("targetRole") as string | undefined;
  const fileUrl = formData.get("fileUrl") as string | undefined;

  await adminCreateResumeTemplate({
    name,
    slug,
    description: description || undefined,
    targetRole: targetRole || undefined,
    fileUrl: fileUrl || undefined,
  });

  redirect("/admin/templates");
}
```

**Layout da página:**
```
AdminShellHeader
  eyebrow: "admin / templates de cv / novo"
  title: "Novo Template"
  (sem actions)

Card com formulário:
  - action={createTemplate}
  - Campos listados acima
  - Nota helper abaixo do slug: "Apenas letras minúsculas e hífens. Ex: classico-simples"
  - Botões: "Criar template" (submit) | "Cancelar" (Link → /admin/templates)
```

---

### 5. Criar página de detalhe/edição — `apps/web/src/app/admin/templates/[id]/page.tsx`

Server Component. Carrega o template pelo id (busca a lista e filtra pelo id).
Exibe formulário preenchido para edição.

**Estrutura:**
```
AdminShellHeader
  eyebrow: "admin / templates de cv / editar"
  title: nome do template
  actions:
    - Form com Server Action para toggleStatus
    - Link "Voltar" → /admin/templates

Card com formulário de edição (mesmos campos do novo):
  - Valores pré-preenchidos com dados do template
  - action={updateTemplate}
  - Botão "Salvar alterações" (submit)
```

**Server Actions:**
```typescript
async function updateTemplate(formData: FormData) {
  "use server";
  // lê os campos, chama adminUpdateResumeTemplate(id, data)
  // redirect("/admin/templates")
}

async function toggleStatus() {
  "use server";
  // chama adminToggleResumeTemplateStatus(id)
  // revalidatePath(`/admin/templates/${id}`)
}
```

**Tratamento de 404:**
Se template não encontrado na lista → `notFound()` do `next/navigation`.

---

## Fluxo completo esperado após implementação

```
1. Admin acessa /admin/templates
2. Vê lista de templates (ou EmptyState)
3. Clica "Novo template" → /admin/templates/novo
4. Preenche nome, slug, descrição (opcional), cargo alvo (opcional)
5. Submit → Server Action cria via POST /api/admin/resume-templates
6. Redirect para /admin/templates (vê o template criado na lista)
7. Template aparece automaticamente em /adaptar para usuários finais
8. Admin pode editar ou desativar via /admin/templates/[id]
```

---

## Checklist de implementação

- [ ] `admin-users-operations.ts` — adicionar item no `adminNavItems`
- [ ] `admin-resume-templates-api.ts` — criar funções de API (4 funções)
- [ ] `admin/templates/page.tsx` — lista com token guard, cards, toggle-status action
- [ ] `admin/templates/novo/page.tsx` — formulário + server action de criação
- [ ] `admin/templates/[id]/page.tsx` — detalhe + formulário de edição + toggle

---

## Verificação antes de encerrar

```bash
npm run check
npm run build
npm run test
```

Garantir que `/admin/templates` aparece no sidebar admin e que criar um template
via interface faz ele aparecer em `GET /api/resume-templates` (rota pública usada pela tela `/adaptar`).
