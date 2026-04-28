## Deploy do MVP EarlyCV

**Stack:** Vercel (web, free) + Railway (API + PostgreSQL, ~$5/mês) + Cloudflare R2 (storage, free)

---

### Passo 1 — Cloudflare R2 (Storage)

1. Acesse dash.cloudflare.com → **R2 Object Storage** → **Create bucket**
2. Nome: `earlycv-prod` | Região: automático
3. Em **Settings** → **CORS Policy**, adicione:

```json
[
  {
    "AllowedOrigins": ["https://earlycv.com.br", "https://www.earlycv.com.br"],
    "AllowedMethods": ["GET", "PUT", "DELETE"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

4. Vá em **Manage R2 API Tokens** → **Create API Token**
   - Permissão: **Object Read & Write** no bucket `earlycv-prod`
   - Salve: `Access Key ID`, `Secret Access Key`, e o **S3 endpoint** (formato `https://<account-id>.r2.cloudflarestorage.com`)

---

### Passo 2 — Railway (API + PostgreSQL)

1. Acesse railway.app → **New Project** → **Deploy from GitHub repo**
2. Selecione o repositório do EarlyCV

**Configurar o serviço da API:**

Em **Settings** do serviço:

- Root Directory: `/`
- O build usa `nixpacks.toml` na raiz do repositório para instalar dependências de runtime da API (incluindo `libreoffice` e `poppler_utils`, necessários para download de PDF)
- Build Command:

```bash
npm ci && npm run build --workspace @earlycv/database && npm run build --workspace @earlycv/ai && npm run build --workspace apps/api
```

- Start Command:

```bash
npx prisma migrate deploy --schema packages/database/prisma/schema.prisma && node apps/api/dist/main.js
```

- Watch Paths: `apps/api/**`, `packages/**`

**Adicionar PostgreSQL:**

Em **New** → **Database** → **Add PostgreSQL** — Railway cria a variável `DATABASE_URL` automaticamente.

**Variáveis de ambiente no Railway** (aba Variables):

```
NODE_ENV=production
PORT=3000

# Database (gerado pelo Railway automaticamente)
DATABASE_URL=<gerado pelo Railway>

# Auth
JWT_SECRET=<gere com: openssl rand -base64 64>
JWT_REFRESH_SECRET=<gere com: openssl rand -base64 64>
SESSION_SECRET=<gere com: openssl rand -base64 32>

# URLs
FRONTEND_URL=https://earlycv.com.br
CORS_ORIGINS=https://earlycv.com.br,https://www.earlycv.com.br

# Cloudflare R2
AWS_ACCESS_KEY_ID=<R2 Access Key ID>
AWS_SECRET_ACCESS_KEY=<R2 Secret Access Key>
AWS_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=earlycv-prod

# OpenAI
OPENAI_API_KEY=sk-...

# Cloudflare Turnstile
CLOUDFLARE_TURNSTILE_SECRET_KEY=<chave secreta do painel Turnstile>

# Google OAuth
GOOGLE_CLIENT_ID=<seu client id>
GOOGLE_CLIENT_SECRET=<seu client secret>
GOOGLE_CALLBACK_URL=https://api.earlycv.com.br/auth/google/callback

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=<token de produção>
MERCADOPAGO_WEBHOOK_SECRET=<secret configurado no painel MP>

# Opcional: PostHog
POSTHOG_API_KEY=<chave>
```

Após deploy, copie a URL pública gerada (ex: `earlycv-api.up.railway.app`). Você pode depois configurar domínio customizado `api.earlycv.com.br` em **Settings → Networking → Custom
Domain**.

---

### Passo 3 — Vercel (Frontend Next.js)

1. Acesse vercel.com → **Add New Project** → importe o repositório
2. Em **Configure Project**:
   - **Root Directory:** `apps/web`
   - **Build Command:** `cd ../.. && npm run build --workspace apps/web`
   - **Install Command:** `cd ../.. && npm install`
   - **Output Directory:** `.next`

**Variáveis de ambiente no Vercel:**

```
NEXT_PUBLIC_API_URL=https://api.earlycv.com.br
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<chave pública do painel Turnstile>
NEXT_PUBLIC_POSTHOG_KEY=<opcional>
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

---

### Passo 4 — DNS no Cloudflare

No painel DNS do seu domínio `earlycv.com.br`:

| Tipo  | Nome  | Valor                          |
| ----- | ----- | ------------------------------ |
| CNAME | `@`   | `cname.vercel-dns.com`         |
| CNAME | `www` | `cname.vercel-dns.com`         |
| CNAME | `api` | `<url-railway>.up.railway.app` |

- No Vercel: **Domains** → adicione `earlycv.com.br` e `www.earlycv.com.br`
- No Railway: **Settings → Networking → Custom Domain** → adicione `api.earlycv.com.br`

---

### Passo 5 — Verificação pós-deploy

```bash
# API health check
curl https://api.earlycv.com.br/health

# CORS OK
curl -H "Origin: https://earlycv.com.br" https://api.earlycv.com.br/health -v
```

Checklist final:

- [ ] Google OAuth: adicione `https://api.earlycv.com.br/auth/google/callback` no Google Cloud Console
- [ ] Mercado Pago: webhook URL = `https://api.earlycv.com.br/api/payments/webhook`
- [ ] Cloudflare Turnstile: adicione `earlycv.com.br` nos domínios permitidos
- [ ] Teste um upload de CV e análise completa
- [ ] Teste o fluxo de pagamento em modo produção
