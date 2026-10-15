import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUrl, reportFetch, dateSchema, DIMENSIONS } from "../lib/gtrack.ts";

const BASE = "https://collector.example/wp-json/g-track-server";

function fakeFetch(status: number, body: string, opts: { delayMs?: number; contentType?: string } = {}): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (opts.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs);
        init?.signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
      });
    }
    return new Response(body, { status, headers: { "content-type": opts.contentType ?? "application/json" } });
  }) as typeof fetch;
}

test("buildUrl encodes scalars, arrays, filters and booleans and skips undefined", () => {
  const u = buildUrl(BASE, "/report/aggregate", { site: "bck", event: "link_click", group_by: ["page", "position"], filters: { casino: "C000008", page: "https://x/a?b=1" }, compare: true, limit: 50, from: undefined });
  assert.equal(u, `${BASE}/report/aggregate?site=bck&event=link_click&group_by=page%2Cposition&filters%5Bcasino%5D=C000008&filters%5Bpage%5D=https%3A%2F%2Fx%2Fa%3Fb%3D1&compare=1&limit=50`);
  assert.equal(buildUrl(BASE + "/", "/report/overview", { site: "gamble", compare: false }), `${BASE}/report/overview?site=gamble&compare=0`);
});

test("dateSchema and DIMENSIONS", () => {
  assert.ok(dateSchema.safeParse("2026-10-14").success);
  assert.ok(!dateSchema.safeParse("14.10.2026").success);
  assert.deepEqual([...DIMENSIONS], ["day", "week", "page", "referrer_host", "placement", "listing", "position", "casino", "bonus", "bonus_type", "wagering", "link_url"]);
});

test("reportFetch sends the key header and returns the body text unchanged", async () => {
  let seen: { url: string; headers: Record<string, string> } | undefined;
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen = { url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()) };
    return new Response('{"site":"bck","rows":[],"truncated":false}', { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const r = await reportFetch("/report/overview", { site: "bck" }, { baseUrl: BASE, key: "k", fetchImpl: f });
  assert.deepEqual(r, { ok: true, text: '{"site":"bck","rows":[],"truncated":false}' });
  assert.equal(seen?.url, `${BASE}/report/overview?site=bck`);
  assert.equal(seen?.headers["x-report-key"], "k");
});

test("reportFetch maps 403, 400, other statuses, non-JSON and timeouts to plain errors", async () => {
  const deps = { baseUrl: BASE, key: "k" };
  assert.deepEqual(await reportFetch("/report/overview", { site: "bck" }, { ...deps, fetchImpl: fakeFetch(403, '{"message":"Forbidden"}') }), { ok: false, error: "report key rejected" });
  assert.deepEqual(await reportFetch("/report/overview", { site: "bck" }, { ...deps, fetchImpl: fakeFetch(400, '{"message":"from is after to."}') }), { ok: false, error: "from is after to." });
  assert.deepEqual(await reportFetch("/report/overview", { site: "bck" }, { ...deps, fetchImpl: fakeFetch(400, "nope") }), { ok: false, error: "bad request" });
  assert.deepEqual(await reportFetch("/report/overview", { site: "bck" }, { ...deps, fetchImpl: fakeFetch(502, "<html>bad gateway</html>", { contentType: "text/html" }) }), { ok: false, error: "collector answered 502" });
  assert.deepEqual(await reportFetch("/report/overview", { site: "bck" }, { ...deps, fetchImpl: fakeFetch(200, "<html>maintenance</html>", { contentType: "text/html" }) }), { ok: false, error: "collector returned non-JSON" });
  assert.deepEqual(await reportFetch("/report/overview", { site: "bck" }, { ...deps, fetchImpl: fakeFetch(200, "{}", { delayMs: 200 }), timeoutMs: 20 }), { ok: false, error: "collector timed out" });
});

test("reportFetch without configuration says which env vars are missing", async () => {
  const saved = { u: process.env.GTRACK_REPORT_URL, k: process.env.GTRACK_REPORT_KEY };
  delete process.env.GTRACK_REPORT_URL; delete process.env.GTRACK_REPORT_KEY;
  assert.deepEqual(await reportFetch("/report/overview", { site: "bck" }), { ok: false, error: "GTRACK_REPORT_URL and GTRACK_REPORT_KEY are not set" });
  if (saved.u) process.env.GTRACK_REPORT_URL = saved.u;
  if (saved.k) process.env.GTRACK_REPORT_KEY = saved.k;
});
