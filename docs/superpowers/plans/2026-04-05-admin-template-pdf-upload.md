# Admin CV Templates — PDF Upload
_Data: 2026-04-05_

## Objetivo

Substituir o campo `fileUrl` (string digitada) pelo upload real de um arquivo PDF.
O admin deve poder fazer upload de um PDF de template diretamente na interface.
Em desenvolvimento usa MinIO (já no docker-compose). Em produção usa S3 da AWS.

---

## Contexto atual

- `ResumeTemplate.fileUrl` existe no banco, mas nunca é populado de forma útil
- O `.env.example` já tem todas as variáveis S3/MinIO: `S3_ENDPOINT`, `S3_REGION`,
  `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- `packages/storage` tem a interface `StorageDriver` mas sem implementação real
- `docker-compose.yml` já tem MinIO configurado em `http://localhost:9000`
- O endpoint de adaptação de CV já usa `FileInterceptor` do Multer — o padrão existe

---

## O que NÃO mudar

- Schema do Prisma: `fileUrl String?` no modelo `ResumeTemplate` — já está correto
- Endpoints existentes de CRUD de templates (GET, POST, PATCH, toggle-status)
- O campo `fileUrl` continua sendo uma string URL — só muda como ela é gerada

---

## Arquivos a criar ou modificar

### 1. Instalar dependência de S3

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage --workspace apps/api
```

### 2. Criar `StorageModule` — `apps/api/src/storage/storage.module.ts`

Provider global que expõe um `StorageService`.

```typescript
import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";

@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

Registrar no `AppModule` imports.

### 3. Criar `StorageService` — `apps/api/src/storage/storage.service.ts`

Responsável por fazer upload e delete de objetos usando S3/MinIO.
Configurado via variáveis de ambiente.

```typescript
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor() {
    // S3_ENDPOINT definido → usa MinIO (dev)
    // S3_ENDPOINT indefinido → usa S3 real (prod)
    const endpoint = process.env.S3_ENDPOINT;

    this.client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: endpoint,
      forcePathStyle: !!endpoint, // necessário para MinIO
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });

    this.bucket = process.env.S3_BUCKET ?? "earlycv-local";

    // URL pública para montar links dos objetos
    this.publicBaseUrl = endpoint
      ? `${endpoint}/${this.bucket}`  // MinIO: http://localhost:9000/earlycv-local
      : `https://${this.bucket}.s3.amazonaws.com`; // S3 real
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.publicBaseUrl}/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
```

### 4. Adicionar endpoint de upload no backend

**Arquivo**: `apps/api/src/resume-templates/resume-templates.controller.ts`

Adicionar ao `AdminResumeTemplatesController`:

```typescript
@Post(":id/upload-file")
@HttpCode(200)
@UseInterceptors(
  FileInterceptor("file", {
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") {
        cb(null, true);
      } else {
        cb(new Error("Only PDF files are allowed"), false);
      }
    },
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  }),
)
uploadFile(
  @Param("id") id: string,
  @UploadedFile() file: Express.Multer.File,
) {
  return this.resumeTemplatesService.uploadFile(id, file);
}
```

### 5. Adicionar método `uploadFile` no `ResumeTemplatesService`

**Arquivo**: `apps/api/src/resume-templates/resume-templates.service.ts`

Injetar `StorageService`. Implementar:

```typescript
async uploadFile(templateId: string, file: Express.Multer.File): Promise<ResumeTemplate> {
  const template = await this.getById(templateId);

  // Remove arquivo anterior se existir
  if (template.fileUrl) {
    const oldKey = this.extractKeyFromUrl(template.fileUrl);
    if (oldKey) await this.storage.deleteObject(oldKey).catch(() => {});
  }

  // Salva novo arquivo
  const key = `templates/${templateId}/template.pdf`;
  const url = await this.storage.putObject(key, file.buffer, file.mimetype);

  return this.database.resumeTemplate.update({
    where: { id: templateId },
    data: { fileUrl: url },
  });
}

private extractKeyFromUrl(url: string): string | null {
  // extrai a key do objeto a partir da URL pública
  const bucket = this.bucket; // precisa expor o bucket no service
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  return idx >= 0 ? url.slice(idx + marker.length) : null;
}
```

### 6. Remover campo `fileUrl` dos DTOs (não aceitar mais string externa)

**Arquivos**:
- `apps/api/src/resume-templates/dto/create-resume-template.dto.ts`
- `apps/api/src/resume-templates/dto/update-resume-template.dto.ts`

Remover o campo `fileUrl` de ambos. O `fileUrl` agora é populado exclusivamente
pelo endpoint de upload — não deve ser editável via JSON.

### 7. Atualizar frontend admin — `apps/web/src/lib/admin-resume-templates-api.ts`

Adicionar função de upload:

```typescript
export async function adminUploadResumeTemplateFile(
  id: string,
  file: File,
): Promise<AdminResumeTemplateDto> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiRequest(
    "POST",
    `/admin/resume-templates/${id}/upload-file`,
    formData,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to upload template file: ${text}`);
  }
  return response.json() as Promise<AdminResumeTemplateDto>;
}
```

Remover `fileUrl` dos parâmetros de `adminCreateResumeTemplate` e `adminUpdateResumeTemplate`.

### 8. Atualizar frontend admin — `apps/web/src/app/admin/templates/novo/page.tsx`

Remover campo `fileUrl` do formulário de criação. (O upload é feito na edição.)

### 9. Atualizar frontend admin — `apps/web/src/app/admin/templates/[id]/page.tsx`

Substituir campo `fileUrl` (input de texto) por **seção de arquivo**:

**Se template.fileUrl existe:**
```
┌─────────────────────────────────────────────────┐
│ Arquivo do template                              │
│                                                  │
│ [PDF] template.pdf                               │
│ ┌──────────────────┐  ┌──────────────────────┐  │
│ │  Visualizar PDF  │  │  Substituir arquivo  │  │
│ └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Se template.fileUrl é null:**
```
┌─────────────────────────────────────────────────┐
│ Arquivo do template                              │
│                                                  │
│  Nenhum arquivo enviado ainda                    │
│  ┌───────────────────────────────────────────┐  │
│  │   Selecionar PDF (máx. 10 MB)             │  │
│  └───────────────────────────────────────────┘  │
│  [Enviar arquivo]                                │
└─────────────────────────────────────────────────┘
```

Como a página de detalhe é Server Component, o upload de arquivo precisa
de um **Client Component filho** (`TemplateFileUpload`) que gerencia o estado
do arquivo selecionado e chama `adminUploadResumeTemplateFile`:

```typescript
// apps/web/src/app/admin/templates/[id]/_components/template-file-upload.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminUploadResumeTemplateFile } from "@/lib/admin-resume-templates-api";

type TemplateFileUploadProps = {
  templateId: string;
  currentFileUrl: string | null;
};

export function TemplateFileUpload({ templateId, currentFileUrl }: TemplateFileUploadProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      await adminUploadResumeTemplateFile(templateId, file);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {currentFileUrl && (
        <div className="flex items-center gap-3">
          <a
            className={buttonVariants({ variant: "outline" })}
            href={currentFileUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Visualizar PDF
          </a>
          <span className="text-sm text-stone-500">
            Arquivo enviado
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <label className="block">
        <input
          accept=".pdf"
          className="hidden"
          disabled={uploading}
          onChange={handleUpload}
          type="file"
        />
        <span className={buttonVariants({ variant: currentFileUrl ? "outline" : "default" })}>
          {uploading
            ? "Enviando..."
            : currentFileUrl
              ? "Substituir arquivo"
              : "Selecionar PDF (máx. 10 MB)"}
        </span>
      </label>
    </div>
  );
}
```

---

## Fluxo completo após implementação

```
1. Admin acessa /admin/templates/novo
2. Preenche: nome, slug, descrição (opcional), cargo alvo (opcional)
   (sem campo de URL — foi removido)
3. Clica "Criar template" → redireciona para /admin/templates/[id]
4. Na página de edição, seção "Arquivo do template" aparece:
   - Se ainda sem arquivo: campo de upload
5. Admin seleciona um PDF → upload automático para MinIO/S3
6. Página refresha e mostra link "Visualizar PDF"
7. Template ativo com PDF aparece em /adaptar para usuários finais
```

---

## Variáveis de ambiente necessárias (já no .env.example)

```
S3_ENDPOINT=http://localhost:9000      # MinIO local; remover em prod S3 real
S3_REGION=us-east-1
S3_BUCKET=earlycv-local
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

Para produção com S3 real: remover `S3_ENDPOINT` e trocar credenciais.

---

## Checklist de implementação

- [ ] `npm install @aws-sdk/client-s3` no workspace `apps/api`
- [ ] `apps/api/src/storage/storage.service.ts` — StorageService com S3Client
- [ ] `apps/api/src/storage/storage.module.ts` — StorageModule global
- [ ] `apps/api/src/app.module.ts` — importar StorageModule
- [ ] `resume-templates.service.ts` — injetar StorageService, implementar `uploadFile`
- [ ] `resume-templates.controller.ts` — endpoint `POST :id/upload-file`
- [ ] `create-resume-template.dto.ts` — remover campo `fileUrl`
- [ ] `update-resume-template.dto.ts` — remover campo `fileUrl`
- [ ] `admin-resume-templates-api.ts` — adicionar `adminUploadResumeTemplateFile`, remover `fileUrl` dos parâmetros
- [ ] `admin/templates/novo/page.tsx` — remover campo `fileUrl`
- [ ] `admin/templates/[id]/_components/template-file-upload.tsx` — componente client de upload
- [ ] `admin/templates/[id]/page.tsx` — substituir input de URL por `<TemplateFileUpload>`

---

## Verificação antes de encerrar

```bash
npm run check
npm run build
npm run test
```

Garantir que:
- `POST /admin/resume-templates/:id/upload-file` com PDF funciona com MinIO rodando
- `fileUrl` é preenchida no banco após upload
- Link "Visualizar PDF" na edição abre o arquivo do MinIO
- Templates sem PDF não quebram a tela `/adaptar`
