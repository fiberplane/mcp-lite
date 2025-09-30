# Groups Composition Example

This example demonstrates how to use the `.group()` method to compose multiple MCP servers into a single unified server.

## Features

- **Flexible namespacing**: Tools support prefix (`validate/email`), suffix (`email_validate`), or both namespacing patterns
- **Middleware composition**: Parent middleware tracks timing for all requests
- **Pure JavaScript**: Works in any environment (Node.js, Bun, Cloudflare Workers, Deno)
- **Clear separation of concerns**: Each server handles a specific domain

> **Note**: Per [Anthropic's research](https://www.anthropic.com/engineering/writing-tools-for-agents), choosing between prefix and suffix namespacing can have measurable effects on tool-use accuracy. Test both approaches with your specific LLM.

## Running the Example

```bash
# Install dependencies
bun install

# Start the server
bun start
```

The MCP server runs on `http://localhost:3000/mcp`, and you can inspect it with:

```bash
bunx @modelcontextprotocol/inspector
```

## How it Works

This example creates three specialized child servers:

### Validate Server (`validate/*`)

- `validate/email` - Check if string is valid email
- `validate/url` - Check if string is valid URL
- `validate/json` - Check if string is valid JSON

### Transform Server (`transform/*`)

- `transform/camelCase` - Convert string to camelCase
- `transform/snakeCase` - Convert string to snake_case
- `transform/base64Encode` - Encode string to base64
- `transform/base64Decode` - Decode base64 string

### Format Server (`format/*`)

- `format/json` - Pretty-print JSON with indentation
- `format/bytes` - Format bytes to human-readable size (KB, MB, GB)

### Parent Server

The parent server composes all three child servers with namespacing and adds middleware to track request timing.

```typescript
const mcp = new McpServer({ name: "data-utils", version: "1.0.0" })
  .group("validate", validateServer)      // Prefix: validate/email
  .group("transform", transformServer)    // Prefix: transform/camelCase
  .group("format", formatServer);         // Prefix: format/json
```

**Alternative suffix namespacing** (following Anthropic's research):

```typescript
const mcp = new McpServer({ name: "data-utils", version: "1.0.0" })
  .group({ suffix: "validate" }, validateServer)   // Suffix: email_validate
  .group({ suffix: "transform" }, transformServer) // Suffix: camelCase_transform
  .group({ suffix: "format" }, formatServer);      // Suffix: json_format
```