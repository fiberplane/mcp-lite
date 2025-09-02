# mcp-mcp-mcp

A TypeScript framework for building MCP (Model Context Protocol) servers with HTTP transport support. Provides a simple, type-safe way to create MCP servers that work with any HTTP framework.

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

// Authentication middleware
mcp.use(async (ctx, next) => {
  // Access request context
  const { request, session } = ctx;
  
  // Perform auth checks
  if (!isAuthenticated(request)) {
    throw new RpcError("Unauthorized", -32000);
  }
  
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
// Express.js
app.post("/mcp", async (req, res) => {
  const response = await httpHandler(req);
  res.json(await response.json());
});

// Node.js built-in
const server = http.createServer(async (req, res) => {
  if (req.url === "/mcp") {
    const response = await httpHandler(req);
    res.writeHead(response.status, response.headers);
    res.end(await response.text());
  }
});
```

## TypeScript Support

### Full Type Safety

```typescript
import type { Ctx, Middleware } from "mcp-mcp-mcp";

// Typed middleware
const myMiddleware: Middleware = async (ctx: Ctx, next) => {
  // ctx is fully typed
  console.log(ctx.request.method);
  await next();
};

// Typed tool handler
mcp.tool("example", {
  handler: (args: { input: string }, ctx: Ctx) => {
    // Both args and ctx are typed
    return { content: [{ type: "text", text: args.input }] };
  },
});
```

### Context Interface

The `Ctx` (MCPServerContext) interface provides:

```typescript
interface MCPServerContext {
  request: JsonRpcReq;
  requestId: JsonRpcId;
  env: Record<string, unknown>;
  state: { cancel?: AbortSignal };
  session?: { id: string; protocolVersion: string };
  validate<T>(validator: unknown, input: unknown): T;
}
```

## Examples

See the `playground/` directory for complete working examples including:
- Hono integration
- Tool registration
- Middleware usage
- Error handling
- Schema validation