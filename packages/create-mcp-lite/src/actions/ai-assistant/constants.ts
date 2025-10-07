export const FIBERPLANE_MCP_NAME = "fiberplane-mcp-server";
export const FIBERPLANE_MCP_URL = "https://fiberplane.com/mcp";

export const FIBERPLANE_MCP_CONFIG = {
  mcpServers: {
    [FIBERPLANE_MCP_NAME]: {
      url: FIBERPLANE_MCP_URL,
      headers: {},
    },
  },
};

export const AGENTS_MD = `# MCP Server Project

This is a Model Context Protocol (MCP) server built with **mcp-lite**.

## Important: Use mcp-lite, NOT @modelcontextprotocol/sdk

**DO NOT use \`@modelcontextprotocol/sdk\`**. This project uses \`mcp-lite\`, a minimal, fetch-first implementation of MCP.

- GitHub: https://github.com/fiberplane/mcp-lite
- Documentation: Read the README and examples in the repo
- Source code: Available in \`node_modules/mcp-lite\`

## Core mcp-lite Patterns

### Basic Server Setup

\`\`\`typescript
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";

const mcp = new McpServer({
  name: "my-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});
\`\`\`

### Adding Tools

\`\`\`typescript
mcp.tool("myTool", {
  description: "Description of what the tool does",
  inputSchema: z.object({
    param: z.string(),
  }),
  handler: (args) => ({
    content: [{ type: "text", text: \`Result: \${args.param}\` }],
  }),
});
\`\`\`

### Transport Binding

\`\`\`typescript
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// With Hono
app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});
\`\`\`

### Adding Resources

Resources provide URI-identified content to MCP clients:

\`\`\`typescript
// Static resource
mcp.resource(
  "file://config.json",
  {
    name: "App Configuration",
    description: "Application configuration",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [{
      uri: uri.href,
      type: "text",
      text: JSON.stringify({ name: "my-app" }),
      mimeType: "application/json",
    }],
  })
);

// Templated resource
mcp.resource(
  "data://items/{id}",
  { description: "Fetch item by ID" },
  async (uri, { id }) => ({
    contents: [{
      uri: uri.href,
      type: "text",
      text: \`Item \${id}\`,
    }],
  })
);
\`\`\`

### Sessions and State

By default, mcp-lite is **stateless**. Add sessions for:
- Progress notifications
- Elicitation (asking user for input mid-execution)
- SSE streaming

\`\`\`typescript
import {
  StreamableHttpTransport,
  InMemorySessionAdapter,
  InMemoryClientRequestAdapter
} from "mcp-lite";

const transport = new StreamableHttpTransport({
  sessionAdapter: new InMemorySessionAdapter({
    maxEventBufferSize: 1024
  }),
  clientRequestAdapter: new InMemoryClientRequestAdapter({
    defaultTimeoutMs: 30000
  })
});
\`\`\`

For production/serverless, implement custom adapters using:
- Cloudflare KV/Durable Objects
- Redis
- Database storage

See \`examples/cloudflare-worker-kv\` for a complete example.

## Key Differences from Official SDK

- Uses Fetch API (works in Bun, Cloudflare Workers, Node, Deno)
- No stdio transport - HTTP + SSE only
- Type inference from Standard Schema validators (Zod, Valibot, etc.)
- Stateless by default, opt-in adapters for sessions
- Middleware support (like Hono)
- Server composition via \`.group()\`

## Resources

Consult the mcp-lite source and examples when implementing features:
- \`node_modules/mcp-lite\` - Full source code
- https://github.com/fiberplane/mcp-lite - Documentation and README
- https://github.com/fiberplane/mcp-lite/tree/main/examples - Working examples
`;
