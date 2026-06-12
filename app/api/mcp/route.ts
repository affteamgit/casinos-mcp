import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";

import { auth0Mcp } from "@/lib/auth0";
import { AUTH_ENABLED } from "@/lib/config";

const INTERNAL_BASE =
  "https://phpstack-1338806-5972702.cloudwaysapps.com/api/index.php";
const WP_BASE = "https://bitcoincasinokings.com/wp-json/casino/v1";
const TOKEN = process.env.CASINO_API_TOKEN;

async function fetchJson(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Upstream ${r.status} for ${url}`);
  return r.json();
}

function asText(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

const handler = createMcpHandler((server) => {
  server.tool(
    "list_casinos",
    "Returns array of {casino_id, brand_name} for every casino. Use this to resolve a brand name to its ID.",
    {},
    async () => {
      const url = `${INTERNAL_BASE}?action=casino_list&token=${TOKEN}`;
      return asText(await fetchJson(url));
    }
  );

  server.tool(
    "find_casino_by_name",
    "Find a casino_id by (partial, case-insensitive) brand name. Returns matches array.",
    { name: z.string().describe("Brand name or substring, e.g. 'CasinOK'") },
    async ({ name }) => {
      const url = `${INTERNAL_BASE}?action=casino_list&token=${TOKEN}`;
      const list = (await fetchJson(url)) as Array<{
        casino_id: string;
        brand_name: string;
      }>;
      const needle = name.toLowerCase();
      const matches = (Array.isArray(list) ? list : []).filter((c) =>
        c.brand_name?.toLowerCase().includes(needle)
      );
      return asText({ query: name, matches });
    }
  );

  server.tool(
    "get_casino_data",
    "Fetch complete data (basic_info, bonuses, ratings, relations, status) for one or more casino IDs.",
    {
      casino_ids: z
        .array(z.string())
        .min(1)
        .describe("Array of casino IDs, e.g. ['C000414']"),
    },
    async ({ casino_ids }) => {
      const ids = casino_ids.join(",");
      const url = `${INTERNAL_BASE}?action=casino_data_complete&casino_id=${ids}&token=${TOKEN}`;
      const data = await fetchJson(url);
      return asText(data);
    }
  );

  server.tool(
    "get_casino_by_name",
    "Resolve a brand name to its full casino data in one call. Errors if multiple casinos match.",
    { name: z.string() },
    async ({ name }) => {
      const list = (await fetchJson(
        `${INTERNAL_BASE}?action=casino_list&token=${TOKEN}`
      )) as Array<{ casino_id: string; brand_name: string }>;
      const matches = (Array.isArray(list) ? list : []).filter((c) =>
        c.brand_name?.toLowerCase().includes(name.toLowerCase())
      );
      if (matches.length === 0)
        return asText({ error: "no_match", query: name });
      if (matches.length > 1)
        return asText({ error: "ambiguous", query: name, matches });
      const id = matches[0].casino_id;
      const data = await fetchJson(
        `${INTERNAL_BASE}?action=casino_data_complete&casino_id=${id}&token=${TOKEN}`
      );
      return asText(data);
    }
  );

  server.tool(
    "live_bonuses",
    "Snapshot of currently active bonuses across all casinos (WordPress REST API). Use for quick overviews.",
    {},
    async () => {
      const data = await fetchJson(`${WP_BASE}/casino-bonuses-live`);
      return asText(data);
    }
  );
}, {}, { basePath: "/api" });

const authHandler = withMcpAuth(
  handler,
  async (_req, token) => {
    if (!token) return undefined;
    return auth0Mcp.verify(token);
  },
  {
    required: AUTH_ENABLED,
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
  }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
