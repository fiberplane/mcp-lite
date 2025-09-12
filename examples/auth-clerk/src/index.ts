// https://github.com/clerk/mcp-tools
import {
  corsHeaders,
  fetchClerkAuthorizationServerMetadata,
  generateClerkProtectedResourceMetadata,
} from "@clerk/mcp-tools/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { mcpAuthMiddleware } from "./auth/auth";
import { httpHandler as mcpHttpHandler } from "./mcp";
import type { AppType } from "./types";

// Create a Hono app to serve our api routes
const app = new Hono<AppType>();

/**
 * Create middleware to handle CORS for the OAuth endpoints,
 * this is useful for testing auth from a browser-based MCP client,
 * or the MCP inspector (which makes requests from a browser)
 *
 * We convert the CORS headers that we get from the @clerk/mcp-tools library
 * into a format that Hono middleware can understand
 *
 * https://github.com/clerk/mcp-tools/blob/main/server.ts
 */
const oauthCorsMiddleware = cors({
  origin: corsHeaders["Access-Control-Allow-Origin"],
  // HACK - split the comma-separated list of methods into an array
  allowMethods: corsHeaders["Access-Control-Allow-Methods"].split(","),
  allowHeaders: [corsHeaders["Access-Control-Allow-Headers"]],
  maxAge: parseInt(corsHeaders["Access-Control-Max-Age"], 10),
});

/**
 * Implement the OAuth Protected Resource endpoint
 */
app.on(
  ["GET", "OPTIONS"],
  ".well-known/oauth-protected-resource",
  oauthCorsMiddleware,
  (c) => {
    const result = generateClerkProtectedResourceMetadata({
      publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
      resourceUrl: "https://myapp.com/current-route",
    });

    return c.json(result);
  },
);

/**
 * Implement the OAuth Authorization Server endpoint
 *
 * @note - In our case, Clerk is the authorization server, so we shouldn't *need* to implement this;
 *         however, in earlier versions of the MCP spec, this was required,
 *         so we implement it for backwards compatibility with clients.
 */
app.on(
  ["GET", "OPTIONS"],
  ".well-known/oauth-authorization-server",
  oauthCorsMiddleware,
  (c) => {
    const result = fetchClerkAuthorizationServerMetadata({
      publishableKey: c.env.CLERK_PUBLISHABLE_KEY,
    });
    // TODO - Remove this log statement, I just wanted to see the output since it isn't typed properly
    console.log("🔑 Clerk Authorization Server Metadata:", result);

    return c.json(result);
  },
);

// Add MCP endpoint
app.all("/mcp", mcpAuthMiddleware, async (c) => {
  const response = await mcpHttpHandler(c.req.raw);
  return response;
});

// Root route describing where to find the MCP endpoint
app.get("/", (c) => {
  return c.text("Authenticated MCP Server! Connect to /mcp");
});

export default app;
