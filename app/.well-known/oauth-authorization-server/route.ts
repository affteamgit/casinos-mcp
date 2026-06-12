import { discoverAuthorizationServerMetadata } from "@modelcontextprotocol/sdk/client/auth.js";

import { AUTH0_DOMAIN, AUTH_ENABLED, corsHeaders } from "@/lib/config";

const handler = async () => {
  if (!AUTH_ENABLED) {
    return new Response(JSON.stringify({ error: "Auth not configured" }), {
      status: 503,
      headers: corsHeaders,
    });
  }

  const oauthMetadata = await discoverAuthorizationServerMetadata(
    new URL(`https://${AUTH0_DOMAIN}`).toString()
  );

  return new Response(JSON.stringify(oauthMetadata), { headers: corsHeaders });
};

const optionsHandler = () => {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
};

export { handler as GET, optionsHandler as OPTIONS };
