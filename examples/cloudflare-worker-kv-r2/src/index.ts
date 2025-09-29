import { Hono } from "hono";
import { logger } from "hono/logger";
import { StreamableHttpTransport } from "mcp-lite";
import { mcpServer } from "./mcp";
import type { AppType } from "./types";

// Create a Hono app to serve our api routes
const app = new Hono<AppType>();

// Set up a logger to log requests
app.use(logger());

// Add MCP endpoint
app.all("/mcp", async (c) => {
  // Create HTTP transport
  const transport = new StreamableHttpTransport();
  const httpHandler = transport.bind(mcpServer);
  const response = await httpHandler(c.req.raw);
  return response;
});

// Root route describing where to find the MCP endpoint
app.get("/", (c) => {
  return c.text(
    "This is Authenticated MCP Server\n\nConnect to /mcp with your MCP client to start the auth flow",
  );
});

export default app;
