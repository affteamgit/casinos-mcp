/** Who may use the tools after Auth0 has verified the token: emails or Auth0 subs, comma-separated. Empty = nobody. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAllowed(claims: { sub?: string; email?: string }, allow: string[]): boolean {
  const keys = [claims.email, claims.sub].filter((k): k is string => typeof k === "string" && k.length > 0).map((k) => k.toLowerCase());
  return keys.some((k) => allow.includes(k));
}

/** Throws when the verified user is not on MCP_ALLOWED_USERS (raw env value). The message names the sub for the server log. */
export function assertAllowed(claims: { sub?: string; email?: string }, raw: string | undefined): void {
  const allow = parseAllowlist(raw);
  if (allow.length === 0) throw new Error("MCP_ALLOWED_USERS is empty: nobody may use the tools");
  if (!isAllowed(claims, allow)) throw new Error(`User not on the allowlist: ${claims.sub ?? "?"} ${claims.email ?? ""}`.trim());
}
