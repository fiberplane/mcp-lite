import { createClerkClient } from "@clerk/backend";
import { TokenType } from "@clerk/backend/internal";
import { verifyClerkToken } from "@clerk/mcp-tools/server";
import { createMiddleware } from "hono/factory";
import type { AppType } from "../types";
import { BaseAuthError, InvalidTokenError } from "./errors";
import type { AuthInfo } from "./types";

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
  // This is the path to our OAuth Protected Resource endpoint we set up in `auth/routes.ts`
  const resourceMetadataPath = "/.well-known/oauth-protected-resource";
  const resourceMetadataUrl = `${origin}${resourceMetadataPath}`;

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

  try {
    const secretKey = c.env.CLERK_SECRET_KEY || "";
    const publishableKey = c.env.CLERK_PUBLISHABLE_KEY || "";

    const clerkClient = createClerkClient({
      secretKey,
      publishableKey,
    });

    const requestState = await clerkClient.authenticateRequest(c.req.raw, {
      secretKey,
      publishableKey,
      acceptsToken: TokenType.OAuthToken,
    });

    // This is the result of the authenticateRequest call, with the token type being OAuthToken
    const auth = requestState.toAuth();

    // Source code for verifyClerkToken: https://github.com/clerk/mcp-tools/blob/b0c946c97c41f248289c31174d0d5c84e977c55c/server.ts#L103
    const authInfo = verifyClerkToken(auth, token);

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
