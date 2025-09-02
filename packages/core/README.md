
A small, simple, web-first framework for building MCP servers.

## Features
- Lightweight and zero dependencies
- Supports Streamable HTTP
- Composable middleware
- Plug your own validation (uses Standard Schema interface)

## Installation

```bash
npm install mcp-mcp-mcp
# or
bun add mcp-mcp-mcp
# or
pnpm add mcp-mcp-mcp
```

## Quick Start

```typescript
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-mcp-mcp";

// Create MCP server
const mcp = new McpServer({
  name: "example-server",
  version: "1.0.0",
});

// Add a tool
mcp.tool("echo", {
  description: "Echoes the input message",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
  },
  handler: (args: { message: string }) => ({
    content: [{ type: "text", text: args.message }],
  }),
});

// Create HTTP transport
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// Integrate with HTTP framework
const app = new Hono();
app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});
```

## Core Components

### McpServer

Main server class for managing tools, prompts, and resources:

```typescript
import { McpServer } from "mcp-mcp-mcp";

const server = new McpServer({
  name: "my-server",
  version: "1.0.0",
});
```

### StreamableHttpTransport

HTTP transport layer that handles JSON-RPC 2.0 communication:

```typescript
import { StreamableHttpTransport } from "mcp-mcp-mcp";

const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(server);
```

## Tool Registration

### Basic Tool

```typescript
mcp.tool("add", {
  description: "Adds two numbers",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["a", "b"],
  },
  handler: (args: { a: number; b: number }) => ({
    content: [{ type: "text", text: String(args.a + args.b) }],
  }),
});
```

### Tool with Standard Schema Validation

Supports schema validators like Zod, Valibot, etc.:

```typescript
import { z } from "zod";

const AddSchema = z.object({
  a: z.number(),
  b: z.number(),
});

mcp.tool("add", {
  description: "Adds two numbers",
  inputSchema: AddSchema,
  handler: (args) => ({
    // args is now typed as { a: number; b: number }
    content: [{ type: "text", text: String(args.a + args.b) }],
  }),
});
```

### Tool Without Input Schema

```typescript
mcp.tool("status", {
  description: "Returns server status",
  handler: () => ({
    content: [{ type: "text", text: "Server is running" }],
  }),
});
```

## Middleware Usage

Add middleware to intercept and process requests:

```typescript
// Logging middleware
mcp.use(async (ctx, next) => {
  console.log("Request:", ctx.request.method);
  await next();
});
```

## Error Handling

### Using RpcError

```typescript
import { RpcError } from "mcp-mcp-mcp";

mcp.tool("divide", {
  description: "Divides two numbers",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["a", "b"],
  },
  handler: (args: { a: number; b: number }) => {
    if (args.b === 0) {
      throw new RpcError("Division by zero", -32000);
    }
    
    return {
      content: [{ type: "text", text: String(args.a / args.b) }],
    };
  },
});
```

### Error Codes

Standard JSON-RPC 2.0 error codes are available:

```typescript
import { JSON_RPC_ERROR_CODES } from "mcp-mcp-mcp";

// Use predefined error codes
throw new RpcError("Invalid params", JSON_RPC_ERROR_CODES.INVALID_PARAMS);
```

## Protocol Support

### MCP Protocol Version

The framework supports MCP protocol version `2025-06-18`.

### JSON-RPC 2.0

All communication follows JSON-RPC 2.0 specification with proper request/response handling and error codes.

### HTTP Integration

Works with any HTTP framework that provides standard `Request`/`Response` objects:

```typescript
// Hono
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-mcp-mcp";

// Create MCP server
const mcp = new McpServer({
  name: "my-server",
  version: "1.0.0",
});

// Add some tools
mcp.tool("echo", {
  description: "Echoes the input message",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
  },
  handler: (args: { message: string }) => ({
    content: [{ type: "text", text: args.message }],
  }),
});

// Create HTTP transport and bind server
const transport = new StreamableHttpTransport();
const httpHandler = transport.bind(mcp);

// Setup Hono app
const app = new Hono();

// Basic MCP endpoint
app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

export default app;
```

## Examples

See the `playground/` directory for complete working examples including:
- Hono integration
- Tool registration
- Middleware usage
- Error handling
- Schema validation