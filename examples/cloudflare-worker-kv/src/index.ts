import { Hono } from "hono";
import { logger } from "hono/logger";
import { httpHandler as mcpHandler } from "./mcp/mcp";

// Create a Hono app to serve our api routes
const app = new Hono<{ Bindings: CloudflareBindings }>();

// Set up a logger to log requests
app.use(logger());

// Add MCP endpoint
app.all("/mcp", async (c) => {
  const response = await mcpHandler(c.req.raw);
  return response;
});

// Root route describing where to find the MCP endpoint
app.get("/", (c) => {
  return c.text(
    "This is an MCP Server that controls Cloudflare KV\n\nConnect to /mcp with your MCP client to start PUTting and GETting values",
  );
});

export default app;
