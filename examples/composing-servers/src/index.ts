import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { formatServer } from "./format-server";
import { transformServer } from "./transform-server";
import { validateServer } from "./validate-server";

// Parent server with request tracking
const mcp = new McpServer({ name: "data-utils", version: "1.0.0" })
  .use(async (ctx, next) => {
    const method = (ctx.request as { method?: string }).method || "unknown";
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`[${method}] completed in ${duration}ms`);
  })
  .group("validate", validateServer)
  .group("transform", transformServer)
  .group("format", formatServer);

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

const app = new Hono();

app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

app.get("/", (c) => {
  return c.json({
    message: "Data Utilities MCP Server - Groups Composition Example",
    description:
      "Three independent servers (validate, transform, format) composed into " +
      "a single MCP endpoint. Pure JavaScript, works in any environment.",
    endpoints: {
      mcp: "/mcp",
    },
    tools: {
      validate: ["email", "url", "json"],
      transform: ["camelCase", "snakeCase", "base64Encode", "base64Decode"],
      format: ["json", "bytes"],
    },
  });
});

export default app;
