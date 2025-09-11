import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";

// Create MCP server with Zod schema adapter
const mcp = new McpServer({
  name: "echo-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

// Define schema
const EchoSchema = z.object({
  message: z.string(),
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
