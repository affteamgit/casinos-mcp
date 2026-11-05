// The six analytics tools: thin wrappers over the collector's report endpoints (see lib/gtrack.ts). Each tool returns
// the collector JSON as text, unchanged, or a tool error with a plain message. Nothing here writes anywhere.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DIMENSIONS, EVENTS, GRANULARITIES, SITES, SORTS, dateSchema, reportFetch } from "./gtrack.ts";
import type { ReportParams, ReportResult } from "./gtrack.ts";

export type FetchReport = (path: string, params: ReportParams) => Promise<ReportResult>;
export const ANALYTICS_TOOL_NAMES = ["analytics_overview", "analytics_pages", "analytics_placements", "analytics_shown_vs_clicked", "analytics_aggregate", "analytics_movers", "analytics_daily"] as const;

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
  server.tool(
    "analytics_movers",
    `Pages and casinos that moved beyond the site trend: the window is always compared with the equal window before it. Site ratio = site total this window / previous window (clicks, clicking sessions and page views each have their own); expected = previous count x ratio; excess = this window minus expected, excess_pct = excess as a percent of expected (null when the previous count was zero). A click mover (page or casino) is at least 10 clicks AND 30 % beyond expected, and its clicking sessions (distinct visits with a click) are at least 5 AND 30 % beyond the site's session trend in the same direction, so a few eager clickers cannot make a trend. A views mover (pages only, moved contains "views") is at least 50 page views AND 30 % beyond. Drops count like rises. Nothing moves on a metric whose previous site total is zero. Each mover carries drivers (top 3: for a page the casinos whose clicks on it changed most, casino_id "" = inline or untagged links; for a casino the pages where its clicks changed most) and snapshot_changes: listing rows added, removed, moved (only the casinos that actually moved; rows merely pushed by an addition, a removal or another casino's move are left out) or bonus (id, title, type, wagering) between the last snapshot day of each window, positions 1 to 10 first, at most 15. snapshot_changes null = a window has no snapshot (unknown); [] = looked, nothing changed. Changes line up with a move; they do not prove its cause. Casino ids exist on clicks since 2026-10-12, so casino numbers for windows starting before 2026-10-19 are unreliable. At most 20 pages (click movers first) and 20 casinos; truncated=true when cut. ${WINDOW}`,
    { site, from, to },
    async (a) => asResult(await fetchReport("/report/movers", { site: a.site, from: a.from, to: a.to }))
  );
  server.tool(
    "analytics_daily",
    `What the daily post should say about one day for one site: clicks only, for the whole site, each page, each casino and each casino on a page. Each one is compared with its own normal week: the median of the four 7-day blocks before the 7 days ending on day, each block scaled by the site trend (the site line unscaled). A mover needs at least 10 clicks and 5 clicking visits (distinct visits with a click, summed per day) in the larger week, a change of at least 30 % in both, the same direction, and |visits - normal visits| / sqrt(visits + normal visits) >= 3 so chance alone cannot explain it. A page with a normal week of 0 has no percentage, so it skips the 30 % rule and must pass the other tests (in practice at least 10 clicks and 9 visits, normal_clicks 0 and change_pct null); the site, casinos and casinos on a page with a normal week of 0 are never movers. posts = the lines to post that day: a mover is posted when it is new, turned the other way, came back after 7 quiet days (again) or grew clearly beyond the last posted week (grew); otherwise it stays quiet, so nothing is said twice. When a casino on a page explains its page or casino (two thirds of the move or more), or a page and a casino are each other's top driver, only one line is posted and the hidden ones are named in also. Each line has drivers (where the clicks came from versus the unscaled normal week) and changes: listing changes from the daily snapshots of the last 14 days, each with the day it was first seen (added, removed, position, bonus, unlisted, listed), positions 1 to 10 first, at most 5; gaps lists days without a snapshot. Clicks of a casino that was unlisted or listed again in the 34 days before a day are left out of every count, so unlisting and relisting never make a line by themselves. Casino and casino-on-page lines start on 2026-11-15 (levels_skipped until then). movers = every mover of the day with posted and why (quiet = already said). A change lines up with a move; it never proves its cause. Listing lines (level listing, from 2026-10-19, at most one per site per day, last in posts): a casino whose clicks in a listing over the 7 days ending on day are clearly above (up) or below (down) expected, the average clicks of its neighbours (up to 2 listed casinos above and 2 below in the same listing, on the same side of "show more"), summed per day: |clicks - expected| / sqrt(clicks + expected) >= 3. Fields: page_url, listing_id, position (on the last compared day), clicks, click_sessions (visits with a click on it, summed per compared day), click_visitors (distinct people over the compared days), expected, days (compared days), z, changes. The test uses clicks; visits and people show whether the clicks came from many people or a few repeat clickers. The casino at #1 can only be down; days when the listing was edited and listings shown twice on a page are left out; unlisted casinos are no neighbours. Same repeat words as the movers; why told (in movers, posted false) = a casino-on-page or casino line already tells it. day is YYYY-MM-DD, defaults to yesterday, from 2026-09-01. Bots are excluded.`,
    { site, day: dateSchema.optional().describe("The day, YYYY-MM-DD (default yesterday)") },
    async (a) => asResult(await fetchReport("/report/daily", { site: a.site, day: a.day }))
  );
}
