# Casino Kings MCP Server

A remote MCP server that wraps the bitcoincasinokings.com APIs and exposes
them as native tools for Claude.

## Tools

- **`list_casinos`** — array of `{casino_id, brand_name}` for all casinos
- **`find_casino_by_name`** — partial, case-insensitive brand search → matches
- **`get_casino_data`** — full data for one or more casino IDs
- **`get_casino_by_name`** — resolve name → full data in one call
- **`live_bonuses`** — snapshot of active bonuses (WordPress REST API)

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# edit .env.local if needed
npm run dev
```

Endpoint is now live at `http://localhost:3000/api/mcp`.

## Deploy to Vercel

### Option A: Vercel CLI

```bash
npm install -g vercel
vercel              # first time: link/create project
vercel --prod       # deploy production
```

### Option B: GitHub integration

1. Push this repo to GitHub
2. Go to vercel.com → "Add New Project" → import your repo
3. Vercel auto-detects Next.js, no config needed

### Set environment variables

In Vercel dashboard → Project → Settings → Environment Variables:

| Name | Required | Notes |
|---|---|---|
| `CASINO_API_TOKEN` | yes | Token for the upstream internal API |
| `MCP_BEARER_TOKEN` | no | If set, Claude must send `Authorization: Bearer <value>` |

Redeploy after adding env vars.

## Connect to Claude

1. In claude.ai → **Settings → Connectors → Add custom connector**
2. Name: `Casino Kings`
3. URL: `https://<your-project>.vercel.app/api/mcp`
4. If you set `MCP_BEARER_TOKEN`, configure it in the connector's auth settings
5. Open your project → enable the connector
6. Test: ask Claude "what tools do you have?" — you should see the 5 tools above

## Notes

- `vercel.json` extends function timeout to 60s (requires Pro plan; remove for Hobby)
- Server is stateless — no database, just proxies API calls
- Tools return raw JSON in a text content block; Claude parses it
