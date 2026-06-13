import { AUTH0_DOMAIN, AUTH_ENABLED, corsHeaders } from "@/lib/config";

const handler = () => {
  if (!AUTH_ENABLED) {
    return new Response(JSON.stringify({ error: "Auth not configured" }), {
      status: 503,
      headers: corsHeaders,
    });
  }

  const issuer = `https://${AUTH0_DOMAIN}/`;
  const metadata = {
    issuer,
    authorization_endpoint: `https://${AUTH0_DOMAIN}/authorize`,
    token_endpoint: `https://${AUTH0_DOMAIN}/oauth/token`,
    registration_endpoint: `https://${AUTH0_DOMAIN}/oidc/register`,
    jwks_uri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
    userinfo_endpoint: `https://${AUTH0_DOMAIN}/userinfo`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: ["openid", "profile", "email", "mcp:tools"],
  };

  return new Response(JSON.stringify(metadata), { headers: corsHeaders });
};

const optionsHandler = () => {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
};

export { handler as GET, optionsHandler as OPTIONS };
