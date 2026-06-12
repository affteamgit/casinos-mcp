export const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
export const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
export const MCP_SERVER_URL =
  process.env.MCP_SERVER_URL ?? "http://localhost:3000/api/mcp";
export const AUTH_ENABLED = Boolean(
  AUTH0_DOMAIN && AUTH0_AUDIENCE && MCP_SERVER_URL
);

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};
