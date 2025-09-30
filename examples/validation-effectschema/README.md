# Effect Schema + mcp-lite Example

A simple MCP server that shows how to use Effect Schema for input validation with mcp-lite.

To run the example:

```bash
# Install dependencies
bun install

# Start the server
bun start
```

The mcp server runs on `http://localhost:3000/mcp`, and you can inspect it at that endpoint with the mcp inspector package:

```bash
bunx @modelcontextprotocol/inspect
```

## How Effect Schema connects to mcp-lite

The key is the `schemaAdapter` in the server setup:

```typescript
import { JSONSchema, Schema } from "effect";

type EffectSchema = ReturnType<typeof Schema.standardSchemaV1>;

const mcp = new McpServer({
  name: "echo-server",
  version: "1.0.0",
  schemaAdapter: (schema) => JSONSchema.make(schema as EffectSchema),
});
```
