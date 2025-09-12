import { createClerkClient } from "@clerk/backend";
import { TokenType } from "@clerk/backend/internal";
import { verifyClerkToken } from "@clerk/mcp-tools/server";
import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import type { AppType } from "../types";
import { BaseAuthError, InvalidTokenError } from "./errors";

// Minimal AuthInfo shape to avoid importing @modelcontextprotocol/sdk types
type AuthInfo = {
  token: string;
  /** Epoch seconds */
  expiresAt?: number;
  scopes: string[];
  /** Additional provider-specific data */
  extra?: Record<string, unknown>;
};

/**
 * Create auth middleware for the MCP server.
 * This should be run on all "/mcp" requests.
 *
 * Sets the "auth" variable on the request context
 */
export const mcpAuthMiddleware = createMiddleware<
  AppType & { Variables: { auth: AuthInfo } }
>(async (c, next) => {
  const req = c.req.raw;
  const url = new URL(req.url);
  const origin = url.origin;
  // This is the path to our OAuth Protected Resource endpoint we set up in index.ts
  const resourceMetadataPath = "/.well-known/oauth-protected-resource";
  const resourceMetadataUrl = `${origin}${resourceMetadataPath}`;

  try {
    const authHeader = c.req.header("Authorization");
    const [type, token] = authHeader?.split(" ") || [];
    const bearerToken = type?.toLowerCase() === "bearer" ? token : undefined;

    // Return 401 with proper www-authenticate header if no authorization is provided
    if (!bearerToken) {
      const err = new InvalidTokenError("No authorization provided");
      return new Response(JSON.stringify(err.toResponseObject()), {
        status: err.status,
        headers: {
          "WWW-Authenticate": `Bearer error="${err.errorCode}", error_description="${err.message}", resource_metadata="${resourceMetadataUrl}"`,
          "Content-Type": "application/json",
        },
      });
    }

    const clerkEnv = env(c);
    const { secretKey, publishableKey, ...rest } = {
      secretKey: clerkEnv.CLERK_SECRET_KEY || "",
      publishableKey: clerkEnv.CLERK_PUBLISHABLE_KEY || "",
      // apiUrl: clerkEnv.CLERK_API_URL,
      // apiVersion: clerkEnv.CLERK_API_VERSION,
    };

    const clerkClient = createClerkClient({
      ...rest,
      // apiUrl,
      // apiVersion,
      secretKey,
      publishableKey,
    });

    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      ...rest,
      secretKey,
      publishableKey,
      acceptsToken: TokenType.OAuthToken,
    });

    // Copied this logic from the Hono middleware, but might not be necessary for OAuth flows
    // (This logic assumes classic Clerk session auth is being used)
    // https://github.com/honojs/middleware/blob/main/packages/clerk-auth/src/clerk-auth.ts
    if (requestState.headers) {
      requestState.headers.forEach((value, key) => {
        c.res.headers.append(key, value);
      });

      const locationHeader = requestState.headers.get("location");

      if (locationHeader) {
        return c.redirect(locationHeader, 307);
      }

      // @ts-expect-error - defensive check
      if (requestState.status === "handshake") {
        throw new Error("Clerk: unexpected handshake without redirect");
      }
    }

    let authInfo: AuthInfo | undefined;
    try {
      // This is the result of the authenticateRequest call, with the token type being OAuthToken
      const auth = requestState.toAuth();
      // TODO - call verifyClerkToken
      const verifiedAuth = verifyClerkToken(auth, token);
      authInfo = verifiedAuth;
    } catch (e) {
      console.error("Unexpected error authenticating bearer token:", e);
      const publicError = new InvalidTokenError("Invalid token");
      return new Response(JSON.stringify(publicError.toResponseObject()), {
        status: publicError.status,
        headers: {
          "WWW-Authenticate": `Bearer error="${publicError.errorCode}", error_description="${publicError.message}", resource_metadata="${resourceMetadataUrl}"`,
          "Content-Type": "application/json",
        },
      });
    }

    // Require valid auth for this endpoint
    if (!authInfo) {
      const err = new InvalidTokenError("Invalid or missing token");
      return new Response(JSON.stringify(err.toResponseObject()), {
        status: err.status,
        headers: {
          "WWW-Authenticate": `Bearer error="${err.errorCode}", error_description="${err.message}", resource_metadata="${resourceMetadataUrl}"`,
          "Content-Type": "application/json",
        },
      });
    }

    // Optional: enforce scopes if desired; read from context if provided upstream
    // const requiredScopes = c.get("requiredScopes") as string[] | undefined;
    // if (Array.isArray(requiredScopes) && requiredScopes.length > 0) {
    //   const hasAll = requiredScopes.every((s: string) =>
    //     authInfo.scopes.includes(s),
    //   );
    //   if (!hasAll) {
    //     const err = new InsufficientScopeError("Insufficient scope");
    //     return new Response(JSON.stringify(err.toResponseObject()), {
    //       status: err.status,
    //       headers: {
    //         "WWW-Authenticate": `Bearer error="${err.errorCode}", error_description="${err.message}", resource_metadata="${resourceMetadataUrl}"`,
    //         "Content-Type": "application/json",
    //       },
    //     });
    //   }
    // }

    // Expiry check (epoch seconds)
    // if (authInfo.expiresAt && authInfo.expiresAt < Date.now() / 1000) {
    //   const err = new InvalidTokenError("Token has expired");
    //   return new Response(JSON.stringify(err.toResponseObject()), {
    //     status: err.status,
    //     headers: {
    //       "WWW-Authenticate": `Bearer error="${err.errorCode}", error_description="${err.message}", resource_metadata="${resourceMetadataUrl}"`,
    //       "Content-Type": "application/json",
    //     },
    //   });
    // }

    // Attach auth to Request and Hono context for downstream handlers
    c.set("auth", authInfo);

    await next();
  } catch (error) {
    if (error instanceof BaseAuthError) {
      return new Response(JSON.stringify(error.toResponseObject()), {
        status: error.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Unexpected auth middleware error:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});
