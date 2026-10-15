// HTTP client for the collector's read-only report endpoints (g-track-server/report/*). The key and the base URL come
// from Vercel env vars; every failure becomes a plain message so the MCP tool can return it as a tool error.
import { z } from "zod";

export const SITES = ["bck", "gamble"] as const;
export const DIMENSIONS = ["day", "week", "page", "referrer_host", "placement", "listing", "position", "casino", "bonus", "bonus_type", "wagering", "link_url"] as const;
export const SORTS = ["views", "clicks", "click_rate"] as const;
export const GRANULARITIES = ["day", "week"] as const;
export const EVENTS = ["page_view", "link_click"] as const;
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export type ReportParams = Record<string, string | number | boolean | readonly string[] | Record<string, string> | undefined>;
export type ReportResult = { ok: true; text: string } | { ok: false; error: string };
export type ReportDeps = { baseUrl?: string; key?: string; fetchImpl?: typeof fetch; timeoutMs?: number };

export function buildUrl(baseUrl: string, path: string, params: ReportParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (typeof v === "boolean") q.set(k, v ? "1" : "0");
    else if (Array.isArray(v)) q.set(k, v.join(","));
    else if (typeof v === "object") for (const [fk, fv] of Object.entries(v as Record<string, string>)) q.set(`${k}[${fk}]`, fv);
    else q.set(k, String(v));
  }
  return `${baseUrl.replace(/\/+$/, "")}${path}?${q.toString()}`;
}

export async function reportFetch(path: string, params: ReportParams, deps: ReportDeps = {}): Promise<ReportResult> {
  const baseUrl = deps.baseUrl ?? process.env.GTRACK_REPORT_URL;
  const key = deps.key ?? process.env.GTRACK_REPORT_KEY;
  if (!baseUrl || !key) return { ok: false, error: "GTRACK_REPORT_URL and GTRACK_REPORT_KEY are not set" };
  const doFetch = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(buildUrl(baseUrl, path, params), {
      headers: { "X-Report-Key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
    });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") return { ok: false, error: "collector timed out" };
    return { ok: false, error: `collector unreachable: ${(e as Error).message}` };
  }
  const text = await res.text();
  if (res.status === 403) return { ok: false, error: "report key rejected" };
  if (res.status === 400) {
    try { const m = JSON.parse(text)?.message; if (typeof m === "string" && m) return { ok: false, error: m }; } catch { /* not JSON */ }
    return { ok: false, error: "bad request" };
  }
  if (!res.ok) return { ok: false, error: `collector answered ${res.status}` };
  try { JSON.parse(text); } catch { return { ok: false, error: "collector returned non-JSON" }; }
  return { ok: true, text };
}
