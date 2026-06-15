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

Without Auth0 env vars configured, the server is open (no auth required).
Set `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`, and `MCP_SERVER_URL` to enable OAuth.

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
| `AUTH0_DOMAIN` | prod | Auth0 tenant domain, e.g. `your-tenant.us.auth0.com` |
| `AUTH0_AUDIENCE` | prod | API identifier; must match `MCP_SERVER_URL` |
| `MCP_SERVER_URL` | prod | Canonical MCP URL, e.g. `https://<project>.vercel.app/api/mcp` |

Redeploy after adding env vars.

## Auth0 + Claude setup (full documentation)

See **[docs/MCP_AUTH_SETUP.md](docs/MCP_AUTH_SETUP.md)** for architecture diagrams, everything we configured in Auth0 and Vercel, how users connect, access control, troubleshooting, and verification commands.

To make Claude use the tools effectively, paste the instructions from **[docs/CLAUDE_PROJECT_INSTRUCTIONS.md](docs/CLAUDE_PROJECT_INSTRUCTIONS.md)** into your Claude Project's custom instructions.

## Auth0 tenant setup

Before deploying with OAuth, configure your Auth0 tenant. Full guide:
[Auth0 Tenant Setup](https://github.com/auth0-samples/auth0-ai-samples/blob/main/auth-for-mcp/fastmcp-mcp-js/README.md#auth0-tenant-setup)

**Minimum steps:**

1. **Enable Resource Parameter Compatibility Profile** — required for MCP
   ([Auth0 guide](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile))

2. **Enable tenant flags** for Claude auto-registration:
   - `client_id_metadata_document_supported`
   - `enable_dynamic_client_registration`
   - `use_scope_descriptions_for_consent`

3. **Create an API (Resource Server)**
   - Identifier: `https://<your-project>.vercel.app/api/mcp` (must match `AUTH0_AUDIENCE`)
   - Signing algorithm: RS256
   - Add scope: `mcp:tools`

4. **Promote login connections to domain-level** so third-party clients (Claude) can use them

5. **Create users** (or enable a connection like Google/email) who should access the connector

6. **Optional:** pre-register a Claude OAuth app in Auth0 and add Client ID/Secret
   in Claude connector Advanced settings

## Connect to Claude

1. In claude.ai → **Settings → Connectors → Add custom connector**
2. Name: `Casino Kings`
3. URL: `https://<your-project>.vercel.app/api/mcp`
4. Open your project → enable the connector
5. On first use, Claude opens an Auth0 login popup; after consent, tools work automatically
6. Test: ask Claude "what tools do you have?" — you should see the 5 tools above

## Local testing

```bash
# Check OAuth discovery endpoint (returns 503 if Auth0 not configured)
curl http://localhost:3000/.well-known/oauth-protected-resource

# Unauthenticated request (returns 401 when Auth0 is configured)
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0.0"}}}'
```

Use [MCP Inspector](https://github.com/modelcontextprotocol/inspector) for interactive testing:

```bash
npx @modelcontextprotocol/inspector
```

Select **Streamable HTTP**, URL `http://localhost:3000/api/mcp`.

## Notes

- `vercel.json` extends function timeout to 10s
- Server is stateless — no database, just proxies API calls
- Tools return raw JSON in a text content block; Claude parses it
- Upstream `CASINO_API_TOKEN` is server-side only; never exposed to MCP clients
