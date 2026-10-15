import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAnalyticsTools, ANALYTICS_TOOL_NAMES } from "../lib/analytics-tools.ts";
import type { ReportParams, ReportResult } from "../lib/gtrack.ts";

type Registered = { name: string; description: string; shape: z.ZodRawShape; handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }> };

function setup(result: ReportResult) {
  const tools: Registered[] = [];
  const calls: { path: string; params: ReportParams }[] = [];
  const server = { tool: (name: string, description: string, shape: z.ZodRawShape, handler: Registered["handler"]) => { tools.push({ name, description, shape, handler }); } } as unknown as McpServer;
  registerAnalyticsTools(server, async (path, params) => { calls.push({ path, params }); return result; });
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  return { tools, calls, byName };
}

test("registers the five tools with descriptions", () => {
  const { tools } = setup({ ok: true, text: "{}" });
  assert.deepEqual(tools.map((t) => t.name), [...ANALYTICS_TOOL_NAMES]);
  assert.deepEqual([...ANALYTICS_TOOL_NAMES], ["analytics_overview", "analytics_pages", "analytics_placements", "analytics_shown_vs_clicked", "analytics_aggregate"]);
  for (const t of tools) assert.ok(t.description.length > 80, `${t.name} description is written for Claude`);
  assert.ok(tools[4].description.includes("referrer_host") && tools[4].description.includes("wagering"), "aggregate lists the dimensions");
});

test("schemas: site enum, dates, compare boolean, group_by 1..3 dimensions, filters record", () => {
  const { byName } = setup({ ok: true, text: "{}" });
  const pages = z.object(byName.analytics_pages.shape);
  assert.ok(pages.safeParse({ site: "bck" }).success);
  assert.ok(pages.safeParse({ site: "bck", from: "2026-10-01", to: "2026-10-07", compare: true, limit: 20, sort: "clicks" }).success);
  assert.ok(!pages.safeParse({ site: "gamblineers" }).success);
  assert.ok(!pages.safeParse({ site: "bck", from: "1.10.2026" }).success);
  assert.ok(!pages.safeParse({ site: "bck", sort: "name" }).success);
  const agg = z.object(byName.analytics_aggregate.shape);
  assert.ok(agg.safeParse({ site: "bck", event: "link_click", group_by: ["page", "position"], filters: { casino: "C000008" } }).success);
  assert.ok(!agg.safeParse({ site: "bck", event: "link_click", group_by: [] }).success);
  assert.ok(!agg.safeParse({ site: "bck", event: "link_click", group_by: ["day", "week", "page", "casino"] }).success);
  assert.ok(!agg.safeParse({ site: "bck", event: "link_click", group_by: ["country"] }).success);
  assert.ok(!agg.safeParse({ site: "bck", event: "vital", group_by: ["day"] }).success);
  assert.ok(!agg.safeParse({ site: "bck", event: "link_click", group_by: ["day"], filters: { ip: "1" } }).success);
  const ov = z.object(byName.analytics_overview.shape);
  assert.ok(ov.safeParse({ site: "gamble", granularity: "week" }).success && !ov.safeParse({ site: "gamble", granularity: "month" }).success);
});

test("handlers call the right path with the arguments and return the text unchanged", async () => {
  const { byName, calls } = setup({ ok: true, text: '{"rows":[1]}' });
  const r = await byName.analytics_pages.handler({ site: "bck", from: "2026-10-01", to: "2026-10-07", compare: true, limit: 20, sort: "clicks" });
  assert.deepEqual(r, { content: [{ type: "text", text: '{"rows":[1]}' }] });
  assert.deepEqual(calls[0], { path: "/report/pages", params: { site: "bck", from: "2026-10-01", to: "2026-10-07", compare: true, limit: 20, sort: "clicks" } });
  await byName.analytics_overview.handler({ site: "gamble", granularity: "week" });
  await byName.analytics_placements.handler({ site: "gamble", compare: false });
  await byName.analytics_shown_vs_clicked.handler({ site: "bck", page: "https://bitcoincasinokings.com/bonus/" });
  await byName.analytics_aggregate.handler({ site: "bck", event: "link_click", group_by: ["page", "position"], filters: { casino: "C000008" } });
  assert.deepEqual(calls.map((c) => c.path), ["/report/pages", "/report/overview", "/report/placements", "/report/shown-vs-clicked", "/report/aggregate"]);
  assert.deepEqual(calls[4].params, { site: "bck", event: "link_click", group_by: ["page", "position"], filters: { casino: "C000008" }, from: undefined, to: undefined });
});

test("a failed fetch becomes a tool error, never a throw", async () => {
  const { byName } = setup({ ok: false, error: "report key rejected" });
  const r = await byName.analytics_overview.handler({ site: "bck" });
  assert.deepEqual(r, { content: [{ type: "text", text: "report key rejected" }], isError: true });
});
