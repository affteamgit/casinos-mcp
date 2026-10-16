// The five analytics tools: thin wrappers over the collector's report endpoints (see lib/gtrack.ts). Each tool returns
// the collector JSON as text, unchanged, or a tool error with a plain message. Nothing here writes anywhere.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DIMENSIONS, EVENTS, GRANULARITIES, SITES, SORTS, dateSchema, reportFetch } from "./gtrack.ts";
import type { ReportParams, ReportResult } from "./gtrack.ts";

export type FetchReport = (path: string, params: ReportParams) => Promise<ReportResult>;
export const ANALYTICS_TOOL_NAMES = ["analytics_overview", "analytics_pages", "analytics_placements", "analytics_shown_vs_clicked", "analytics_aggregate"] as const;

const WINDOW = "Dates are YYYY-MM-DD, inclusive; to defaults to yesterday and from to six days before to; at most 92 days per call. Bots are excluded. Numbers are counts; *_per_100_* are rates; *_change_pct is null when the previous value was zero.";
const site = z.enum(SITES).describe("bck = bitcoincasinokings.com, gamble = gamble.io");
const from = dateSchema.optional().describe("First day, YYYY-MM-DD");
const to = dateSchema.optional().describe("Last day, YYYY-MM-DD (default yesterday)");
const compare = z.boolean().optional().describe("true adds the previous window of equal length (prev_* columns and change columns, prev_from/prev_to in the answer)");

function asResult(r: ReportResult) {
  return r.ok ? { content: [{ type: "text" as const, text: r.text }] } : { content: [{ type: "text" as const, text: r.error }], isError: true };
}

export function registerAnalyticsTools(server: McpServer, fetchReport: FetchReport = (p, q) => reportFetch(p, q)): void {
  server.tool(
    "analytics_overview",
    `Daily or weekly totals for one site: page_views, sessions, visitors, clicks (affiliate link clicks), click_sessions, clicks_per_100_views and click_sessions_per_100_sessions, one row per period with zeros for empty periods. Use it first to see the shape of a week or to spot a day that moved. ${WINDOW}`,
    { site, from, to, granularity: z.enum(GRANULARITIES).optional().describe("day (default) or week (ISO weeks, Monday start)") },
    async (a) => asResult(await fetchReport("/report/overview", { site: a.site, from: a.from, to: a.to, granularity: a.granularity }))
  );
  server.tool(
    "analytics_pages",
    `Per-page totals for one site (page_url without query or fragment): page_views, sessions, visitors, clicks, click_sessions, clicks_per_100_views. With compare=true each row also carries prev_* values, page_views_change_pct, clicks_change_pct and click_rate_change_pts, and pages present only in the previous window are appended with zeros. Use it for "how did page X do" and "which pages moved". ${WINDOW}`,
    { site, from, to, compare, limit: z.number().int().min(1).max(500).optional().describe("Rows, default 50, max 500"), sort: z.enum(SORTS).optional().describe("views (default), clicks or click_rate") },
    async (a) => asResult(await fetchReport("/report/pages", { site: a.site, from: a.from, to: a.to, compare: a.compare, limit: a.limit, sort: a.sort }))
  );
  server.tool(
    "analytics_placements",
    `Clicks grouped by where on the page the button was (placement: latest-casinos-listing, editor-selected-listing, created-listing, the three *-bonuses-listing keys, review-header, review-bonuses, review-alternatives, sticky-bar, casino-bonus, content; empty = clicks before 2026-10-12) and by the bonus_type and wagering string shown on the button; clicks, click_sessions and share_pct of all clicks. With compare=true: prev_clicks, prev_share_pct, clicks_change_pct, share_change_pts. Use it to see which parts of the pages and which bonus offers earn the clicks. ${WINDOW}`,
    { site, from, to, compare },
    async (a) => asResult(await fetchReport("/report/placements", { site: a.site, from: a.from, to: a.to, compare: a.compare }))
  );
  server.tool(
    "analytics_shown_vs_clicked",
    `What the listings showed versus what got clicked: one row per (page_url, listing_id, block_index, position, casino_id, bonus_id) from the daily listing snapshots, with casino_name, bonus_title, bonus_type, wagering, days_shown, days_visible_initially (shown without scrolling), clicks and clicks_per_shown_day. Use it for "we showed casino X in position 2 all week, did anyone click" and to find well-placed rows with no clicks. A whole site has more rows than the 500 cap, so for the weekly routine call it with flags=true: the collector then reads every row and returns only the ones tripping a rule, each with a flag column: top3_no_clicks (position 1 to 3, shown on every snapshot day of the window, zero clicks while the same listing block got clicks) or outclicks_rows_above (position above 5 with more clicks than every row above it in the same listing block), plus block_clicks for context; snapshot_days in the answer is how many days had a snapshot. ${WINDOW}`,
    { site, from, to, page: z.string().url().optional().describe("Only this page (any spelling: with or without trailing slash, query or fragment)"), limit: z.number().int().min(1).max(500).optional().describe("Rows, default 200, max 500"), flags: z.boolean().optional().describe("true = only rows tripping the two routine rules (flag column), uncapped scan; default false = all rows up to limit") },
    async (a) => asResult(await fetchReport("/report/shown-vs-clicked", { site: a.site, from: a.from, to: a.to, page: a.page, limit: a.limit, flags: a.flags }))
  );
  server.tool(
    "analytics_aggregate",
    `Flexible counter for follow-up questions: events, sessions and visitors of one event type (page_view or link_click) grouped by 1 to 3 dimensions, optionally filtered. Dimensions: ${DIMENSIONS.join(", ")}. page = URL without query/fragment; referrer_host = the referring site; week = YEARWEEK number; casino/bonus/listing are ids (C000008, B00000266, 195). Sorted by events, at most 200 rows (truncated=true when cut). Use it after the fixed reports to dig into one finding, for example clicks by position for one page, or page views by referrer_host by day. ${WINDOW}`,
    {
      site, from, to,
      event: z.enum(EVENTS).describe("page_view or link_click"),
      group_by: z.array(z.enum(DIMENSIONS)).min(1).max(3).describe("1 to 3 dimensions"),
      filters: z.record(z.enum(DIMENSIONS), z.string()).optional().describe("Dimension name to one value, e.g. {\"casino\":\"C000008\"}"),
    },
    async (a) => asResult(await fetchReport("/report/aggregate", { site: a.site, event: a.event, group_by: a.group_by, filters: a.filters, from: a.from, to: a.to }))
  );
}
