# Zod + mcp-lite Example

A simple MCP server that shows how to use Zod schemas for input validation with automatic type inference.

## What it does

This example demonstrates three MCP tools with different levels of Zod validation:

1. **`validate_message`** - Basic validation with optional fields
2. **`validate_user_profile`** - Complex nested object validation  
3. **`process_numbers`** - Advanced features like transforms and defaults

## How Zod connects to mcp-lite

The key is the `schemaAdapter` in the server setup:

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";

const mcp = new McpServer({
  name: "zod-validation-server",
  version: "1.0.0",
  schemaAdapter: (schema) => zodToJsonSchema(schema as z.ZodType),
});
```

This automatically converts your Zod schemas to JSON Schema for MCP clients, while giving you full TypeScript type inference:

```typescript
const MessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  timestamp: z.number().optional(),
});

mcp.tool("validate_message", {
  description: "Validates a message",
  inputSchema: MessageSchema, // Zod schema goes here
  handler: (args) => {
    // args is automatically typed from MessageSchema
    return {
      content: [{ type: "text", text: `Message: ${args.message}` }]
    };
  }
});
```

## How to run it

From the repository root:

```bash
# Install dependencies
bun install

# Start the server
cd examples/zod
bun start
```

The server runs on `http://localhost:3000` with:
- MCP endpoint: `http://localhost:3000/mcp`
- Web interface: `http://localhost:3000/`

## Quick test

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "validate_message",
      "arguments": {
        "message": "Hello from Zod!",
        "timestamp": 1640995200000
      }
    }
  }'
```