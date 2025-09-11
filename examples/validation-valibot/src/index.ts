import { toJsonSchema } from "@valibot/to-json-schema";
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import * as v from "valibot";

// Create MCP server with a Valibot-to-JSON-schema adapter
const mcp = new McpServer({
  name: "echo-server",
  version: "1.0.0",
  schemaAdapter: (schema) => toJsonSchema(schema as v.AnySchema),
});

// Define schema
const EchoSchema = v.object({
  message: v.string(),
});

// Add a tool
mcp.tool("echo", {
  description: "Echoes the input message",
  inputSchema: EchoSchema,
  handler: (args) => ({
    // args is automatically typed as { message: string }
    content: [{ type: "text", text: args.message }],
  }),
});

// Create HTTP transport
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// Create Hono app
const app = new Hono();

// Add MCP endpoint
app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

// Root endpoint
app.get("/", (c) => {
  return c.text("Echo MCP Server - MCP endpoint available at /mcp");
});

export default app;
