# Zod + mcp-lite Example

A simple MCP server that shows how to use Zod schemas for input validation with mcp-lite.

To run the example:

```bash
# Install dependencies
bun install

# Start the server
bun start
```

The mcp server runs on `http://localhost:3000/mcp`, and you can inspect it at that endpoint with the mcp inspector package:

```bash
bunx @modelcontextprotocol/inspector
```

## How Zod connects to mcp-lite

The key is the `schemaAdapter` in the server setup:

```typescript
import { z } from "zod";

const mcp = new McpServer({
  name: "echo-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});
```
