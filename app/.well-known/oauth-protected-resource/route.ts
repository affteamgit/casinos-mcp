import { ProtectedResourceMetadataBuilder } from "@auth0/auth0-api-js";

import {
  AUTH0_DOMAIN,
  AUTH_ENABLED,
  MCP_SERVER_URL,
  corsHeaders,
} from "@/lib/config";

const handler = () => {
  if (!AUTH_ENABLED) {
    return new Response(JSON.stringify({ error: "Auth not configured" }), {
      status: 503,
      headers: corsHeaders,
    });
  }

  const metadata = new ProtectedResourceMetadataBuilder(MCP_SERVER_URL, [
    `https://${AUTH0_DOMAIN}/`,
  ])
    .withJwksUri(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
    .withScopesSupported(["openid", "profile", "email", "mcp:tools"])
    .build();

  return new Response(JSON.stringify(metadata.toJSON()), {
    headers: corsHeaders,
  });
};

const optionsHandler = () => {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
};

export { handler as GET, optionsHandler as OPTIONS };
