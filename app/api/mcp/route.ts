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

type CasinoListItem = {
  casino_id: string;
  brand_name: string;
  site_id: string;
  status: string;
};

// API returns either a flat array or {ok, msg, data: [...]}
function unwrapList(response: unknown): CasinoListItem[] {
  if (Array.isArray(response)) return response as CasinoListItem[];
  const wrapped = response as { data?: unknown };
  if (Array.isArray(wrapped?.data)) return wrapped.data as CasinoListItem[];
  return [];
}

function asText(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

const handler = createMcpHandler((server) => {
  server.tool(
    "list_casinos",
    "Returns array of {casino_id, brand_name, site_id, status} for every casino. Optionally filter by site_id to get casinos for a specific site. Use this to resolve a brand name to its ID.",
    {
      site_id: z
        .string()
        .optional()
        .describe("Optional site ID to filter casinos by site, e.g. '1'"),
    },
    async ({ site_id }) => {
      let url = `${INTERNAL_BASE}?action=casino_list&token=${TOKEN}`;
      if (site_id) url += `&site_id=${encodeURIComponent(site_id)}`;
      return asText(unwrapList(await fetchJson(url)));
    }
  );

  server.tool(
    "find_casino_by_name",
    "Find a casino_id by (partial, case-insensitive) brand name. Returns matches array.",
    {
      name: z.string().describe("Brand name or substring, e.g. 'CasinOK'"),
      site_id: z
        .string()
        .optional()
        .describe("Optional site ID to restrict search to a specific site"),
    },
    async ({ name, site_id }) => {
      let url = `${INTERNAL_BASE}?action=casino_list&token=${TOKEN}`;
      if (site_id) url += `&site_id=${encodeURIComponent(site_id)}`;
      const list = unwrapList(await fetchJson(url));
      const needle = name.toLowerCase();
      const matches = list.filter((c) =>
        c.brand_name?.toLowerCase().includes(needle)
      );
      return asText({ query: name, site_id, matches });
    }
  );

  server.tool(
    "get_casino_data",
    "Fetch complete data (basic_info, bonuses, ratings, relations, status) for one or more casino IDs. Pass site_id to include site-specific bonuses.",
    {
      casino_ids: z
        .array(z.string())
        .min(1)
        .describe("Array of casino IDs, e.g. ['C000414']"),
      site_id: z
        .string()
        .optional()
        .describe(
          "Optional site ID to include site-specific bonuses in the response, e.g. '1'"
        ),
    },
    async ({ casino_ids, site_id }) => {
      const ids = casino_ids.join(",");
      let url = `${INTERNAL_BASE}?action=casino_data_complete&casino_id=${ids}&token=${TOKEN}`;
      if (site_id) url += `&site_id=${encodeURIComponent(site_id)}`;
      const data = await fetchJson(url);
      return asText(data);
    }
  );

  server.tool(
    "get_casino_by_name",
    "Resolve a brand name to its full casino data in one call. Optionally scope to a site_id. Errors if multiple casinos match.",
    {
      name: z.string(),
      site_id: z
        .string()
        .optional()
        .describe("Optional site ID to restrict the search to a specific site"),
    },
    async ({ name, site_id }) => {
      let listUrl = `${INTERNAL_BASE}?action=casino_list&token=${TOKEN}`;
      if (site_id) listUrl += `&site_id=${encodeURIComponent(site_id)}`;
      const list = unwrapList(await fetchJson(listUrl));
      const matches = list.filter((c) =>
        c.brand_name?.toLowerCase().includes(name.toLowerCase())
      );
      if (matches.length === 0)
        return asText({ error: "no_match", query: name });
      if (matches.length > 1)
        return asText({ error: "ambiguous", query: name, matches });
      const id = matches[0].casino_id;
      let dataUrl = `${INTERNAL_BASE}?action=casino_data_complete&casino_id=${id}&token=${TOKEN}`;
      if (site_id) dataUrl += `&site_id=${encodeURIComponent(site_id)}`;
      const data = await fetchJson(dataUrl);
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
