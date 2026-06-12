import { ApiClient, VerifyAccessTokenError } from "@auth0/auth0-api-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

import { AUTH0_AUDIENCE, AUTH0_DOMAIN, AUTH_ENABLED } from "./config";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function createTokenVerifier() {
  let apiClient: ApiClient | null = null;

  function getClient() {
    if (!apiClient) {
      apiClient = new ApiClient({
        domain: AUTH0_DOMAIN!,
        audience: AUTH0_AUDIENCE!,
      });
    }
    return apiClient;
  }

  return async function verify(token: string): Promise<AuthInfo> {
    if (!AUTH_ENABLED) {
      throw new InvalidTokenError("Auth is not configured");
    }
    try {
      const decoded = await getClient().verifyAccessToken({
        accessToken: token,
      });

      if (!isNonEmptyString(decoded.sub)) {
        throw new InvalidTokenError("Token is missing 'sub' claim");
      }

      let clientId: string | null = null;
      if (isNonEmptyString(decoded.client_id)) {
        clientId = decoded.client_id;
      } else if (isNonEmptyString(decoded.azp)) {
        clientId = decoded.azp;
      }

      if (!clientId) {
        throw new InvalidTokenError(
          "Token is missing 'client_id' or 'azp' claim"
        );
      }

      return {
        token,
        clientId,
        scopes:
          typeof decoded.scope === "string"
            ? decoded.scope.split(" ").filter(Boolean)
            : [],
        ...(decoded.exp && { expiresAt: decoded.exp }),
        extra: {
          sub: decoded.sub,
          ...(isNonEmptyString(decoded.client_id) && {
            client_id: decoded.client_id,
          }),
          ...(isNonEmptyString(decoded.azp) && { azp: decoded.azp }),
          ...(isNonEmptyString(decoded.name) && { name: decoded.name }),
          ...(isNonEmptyString(decoded.email) && { email: decoded.email }),
        },
      };
    } catch (error) {
      if (error instanceof VerifyAccessTokenError) {
        throw new InvalidTokenError(error.message);
      }
      throw error;
    }
  };
}

const verify = createTokenVerifier();

export const auth0Mcp = { verify };
