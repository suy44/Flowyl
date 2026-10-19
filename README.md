<div align="center">

# ⚡ Flowyl

**Idempotency & Rate Limit Gateway for AI Agents and Automation Workflows**

Stop your agents from sending the same email 3 times, creating duplicate invoices, or crashing on HTTP 429.

[![Tests](https://img.shields.io/badge/tests-93%20passed-00e5ff?style=flat-square)](.)
[![License](https://img.shields.io/badge/license-MIT-0088ff?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/deploy-Vercel%20%7C%20Cloudflare-7c4dff?style=flat-square)](.)

</div>

---

## 🚀 Quick Start

### 1. Get an API Key

```bash
# Create a free API key (5,000 requests/month)
# Visit: https://flowyl.vercel.app
```

### 2. Send Requests Through Flowyl

```bash
curl -X POST https://flowyl.vercel.app/v1/execute \
  -H "Authorization: Bearer ak_live_your_key_here" \
  -H "X-Flowyl-Key: send_invoice:order_4821" \
  -H "X-Flowyl-Preset: airtable" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "POST",
    "url": "https://api.airtable.com/v0/appXXX/Invoices",
    "headers": {
      "Authorization": "Bearer pat_xxx",
      "Content-Type": "application/json"
    },
    "body": {
      "fields": { "Amount": 299, "Customer": "John Doe" }
    }
  }'
```

### 3. That's It

- **First call** → Flowyl forwards the request, stores the result, returns `"status": "executed"`
- **Duplicate call** (same key within TTL) → Returns cached response instantly, `"status": "deduplicated"` — the real API is never called again
- **Rate limited** → Request is queued and retried automatically, `"status": "queued"`

---

## 📡 API Reference

### `POST /v1/execute`

Main proxy endpoint. Wrap any outbound HTTP request.

**Headers:**

| Header | Required | Description |
|---|---|---|
| `Authorization` | ✅ | `Bearer <api_key>` |
| `X-Flowyl-Key` | ✅ | Unique idempotency key (max 256 chars). E.g. `send_email:user_123` *(legacy `X-ActionLock-Key` also accepted)* |
| `X-Flowyl-TTL` | ❌ | Key retention in seconds (default: 86400 = 24h) |
| `X-Flowyl-Preset` | ❌ | Rate-limit preset: `airtable`, `notion`, `hubspot`, `slack`, `whatsapp` |

**Body (JSON):**

```json
{
  "method": "POST",
  "url": "https://api.example.com/endpoint",
  "headers": { "Authorization": "Bearer token" },
  "body": { "key": "value" }
}
```

**Response Statuses:**

| Status | HTTP Code | Meaning |
|---|---|---|
| `executed` | 200 | Request was forwarded and response cached |
| `deduplicated` | 200 | Duplicate key — cached response returned |
| `queued` | 202 | Rate limited — request queued for retry |

### `GET /v1/status/:key`

Check the status of an idempotency key.

### `DELETE /v1/keys/:key`

Manually invalidate a cached execution to allow re-execution.

### `GET /v1/health`

Public health check (no auth required).

---

## 🎯 Rate Limit Presets

Pre-configured for popular APIs used in automation workflows:

| Preset | API | Rate | Burst | Strategy |
|---|---|---|---|---|
| `airtable` | Airtable | 5 req/s | 10 | Exponential + Retry-After |
| `notion` | Notion | 3 req/s | 5 | Exponential + Retry-After |
| `hubspot` | HubSpot | 10 req/s | 20 | Exponential + Retry-After |
| `slack` | Slack Web API | 1 req/s | 3 | Retry-After |
| `whatsapp` | WhatsApp Cloud | 80 msg/s | 100 | Exponential |

---

## 🔌 n8n Integration

Install the Flowyl community node:

```bash
npm install n8n-nodes-flowyl
```

Then drag the **Flowyl** node into any workflow and configure:
1. **API Key** — your Flowyl API key
2. **Idempotency Key** — use n8n expressions: `{{$node.trigger.json.event_id}}`
3. **Preset** — select target API from dropdown

---

## 🏗️ Architecture

```
Client → Flowyl Gateway → Check KV (dedup) → Forward to target API
                        ↳ If 429 → Queue in Durable Object → Drain at preset rate
```

**Stack:**
- **Runtime:** Edge Serverless (Vercel Edge Functions & Cloudflare Workers)
- **Idempotency Store:** Global KV / Redis Adapter with TTL built-in
- **Rate Queue:** Durable Objects (strong consistency per destination)
- **Auth:** API keys in KV / Memory Store

---

## 💰 Pricing

| Tier | Requests/mo | Key TTL | Price |
|---|---|---|---|
| Free | 5,000 | 24 hours | $0 |
| Starter | 100,000 | 7 days | $9/mo |
| Pro | 500,000 | 30 days | $24/mo |

---

## 🛠️ Development & Deployment

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run locally
npm run dev
```

### 🚀 Deploying to Vercel (All-in-One)

Flowyl is pre-configured for zero-friction Vercel hosting:
- **Landing Page**: Served statically from `public/` at the root URL `/`
- **Founder Admin Dashboard**: Served at `/admin`
- **Edge API**: Routed from `/v1/*` directly to `api/index.ts`
- **Zero-Config Storage**: In-memory TTL caching out of the box; connects seamlessly to Upstash Redis / Vercel KV if environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) are configured.

#### Option 1: GitHub Integration (One-Click)
1. Push this repository to GitHub:
   ```bash
   git remote add origin https://github.com/suy44/Flowyl.git
   git push -u origin master
   ```
2. Open [vercel.com/new](https://vercel.com/new), import your **Flowyl** repository, and click **Deploy**.

#### Option 2: Vercel CLI
```bash
npx vercel
```

---

## 📁 Project Structure

```
flowyl/
├── vercel.json                # Vercel Edge routing & CORS rules
├── wrangler.toml              # Cloudflare Workers config
├── package.json
├── tsconfig.json
├── public/                    # Website landing page, Founder Admin, assets
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── admin.html
│   ├── admin.css
│   ├── admin.js
│   ├── flowyl-banner.png
│   ├── flowyl-logo.png
│   ├── flowyl-icon.png
│   └── favicon.ico
├── api/
│   └── index.ts               # Vercel Edge entry handler
├── src/
│   ├── index.ts               # Worker entry + router
│   ├── types.ts               # Shared TypeScript types
│   ├── routes/
│   │   ├── execute.ts         # POST /v1/execute
│   │   ├── status.ts          # GET /v1/status/:key
│   │   ├── keys.ts            # DELETE /v1/keys/:key
│   │   ├── health.ts          # GET /v1/health
│   │   └── admin.ts           # Admin overview & key management
│   ├── core/
│   │   ├── idempotency.ts     # KV-based idempotency store
│   │   ├── proxy.ts           # HTTP proxy/forward logic
│   │   ├── queue.ts           # Rate-limit queue
│   │   └── presets.ts         # Rate limit preset definitions
│   ├── storage/
│   │   ├── kv-adapter.ts      # Multi-platform KV adapter
│   │   └── analytics.ts       # Telemetry & metrics store
│   └── utils/
│       ├── response.ts        # Response helpers + CORS
│       └── headers.ts         # Dual header parsing (Flowyl + legacy)
└── test/
    └── *.test.ts              # 93 Vitest unit & E2E tests
```

---

## License

MIT © 2026 Flowyl
