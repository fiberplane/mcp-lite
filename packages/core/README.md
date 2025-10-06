# mcp-lite

A lightweight, web-first framework for building MCP servers.

```typescript
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import { z } from "zod";

// Create MCP server with Zod schema adapter
const mcp = new McpServer({
  name: "example-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

// Define schemas for input and output
const WeatherInputSchema = z.object({
  location: z.string(),
});

const WeatherOutputSchema = z.object({
  temperature: z.number(),
  conditions: z.string(),
});

// Add a tool with structured output
mcp.tool("getWeather", {
  description: "Gets weather information for a location",
  inputSchema: WeatherInputSchema,
  outputSchema: WeatherOutputSchema,
  handler: (args) => ({
    // args is automatically typed as { location: string }
    content: [{
      type: "text",
      text: `Weather in ${args.location}: 22°C, sunny`
    }],
    // structuredContent value is typed and validated
    structuredContent: {
      temperature: 22,
      conditions: "sunny",
    },
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

> [!TIP]
>
> The Model Context Protocol (MCP) is an open standard that enables secure connections between host applications and external data sources and tools, allowing AI assistants to reason over information and execute functions with user permission.

## Features

- Zero dependencies
- Type-safe tool definitions with Standard Schema (Zod, Valibot, Effect, ArkType)
- HTTP/SSE transport (not stdio)
- Adapter pattern for sessions and state management
- Middleware support
- Server composition via `.group()`

## Installation

```bash
npm install mcp-lite
# or
bun add mcp-lite
# or
pnpm add mcp-lite
```

## Type Safety

### Automatic Type Inference

Standard Schema validators provide automatic type inference:

```typescript
import { z } from "zod";

const SearchSchema = z.object({
  query: z.string(),
  limit: z.number().optional(),
  filters: z.array(z.string()).optional()
});

server.tool("search", {
  inputSchema: SearchSchema,
  handler: (args) => {
    // args is typed as { query: string, limit?: number, filters?: string[] }
    args.query.toLowerCase()
    args.limit ?? 10
    args.filters?.map(f => f.trim())

    return { content: [{ type: "text", text: "..." }] }
  }
})
```

### Structured Outputs

Tools can return both human-readable content and machine-readable structured data. Use `outputSchema` to define the shape of `structuredContent`:

```typescript
const WeatherOutputSchema = z.object({
  temperature: z.number(),
  conditions: z.string(),
});

server.tool("getWeather", {
  inputSchema: z.object({ location: z.string() }),
  outputSchema: WeatherOutputSchema,
  handler: (args) => ({
    content: [{
      type: "text",
      text: `Weather in ${args.location}: 22°C, sunny`
    }],
    // structuredContent is typed and validated at runtime
    structuredContent: {
      temperature: 22,
      conditions: "sunny",
    }
  })
})
```

The `outputSchema` provides runtime validation and type inference for `structuredContent`.

### Context API

The handler context provides typed access to session data, authentication, and client capabilities:

```typescript
handler: (args, ctx) => {
  ctx.progress?.({ progress: 50, total: 100 })
  ctx.session?.id
  ctx.authInfo?.userId
  ctx.state.myCustomData = "..."

  const validated = ctx.validate(MySchema, data)

  if (ctx.client.supports("elicitation")) {
    const result = await ctx.elicit({
      message: "Confirm action?",
      schema: z.object({ confirmed: z.boolean() })
    })
  }
}
```

### Multiple Validation Libraries

Use different validation libraries in the same server:

```typescript
import { z } from "zod"
import * as v from "valibot"
import { Schema } from "@effect/schema"

server
  .tool("zod-tool", { inputSchema: z.object({ ... }), handler: ... })
  .tool("valibot-tool", { inputSchema: v.object({ ... }), handler: ... })
  .tool("effect-tool", { inputSchema: Schema.struct({ ... }), handler: ... })
  .tool("json-schema-tool", {
    inputSchema: { type: "object", properties: { ... } },
    handler: (args: MyType) => ...
  })
```

## Scaling with Adapters

The framework uses adapters for sessions and state, allowing you to scale from development to production without changing your core logic.

### Deployment Patterns

| Environment | Session Storage | State Storage | Transport Configuration |
|-------------|----------------|---------------|------------------------|
| Development | None | N/A | `StreamableHttpTransport()` |
| Single server | In-memory | In-memory | `InMemorySessionAdapter` |
| Distributed | Redis/KV | Redis/KV | Custom adapters |
| Serverless | KV/R2 | Durable Objects | See examples below |

### Adapter Configuration

```typescript
// Development: stateless
const transport = new StreamableHttpTransport()

// Production: with sessions and client requests
const transport = new StreamableHttpTransport({
  sessionAdapter: new InMemorySessionAdapter({
    maxEventBufferSize: 1024
  }),
  clientRequestAdapter: new InMemoryClientRequestAdapter({
    defaultTimeoutMs: 30000
  })
})
```

### Built-in Adapters

- `InMemorySessionAdapter` - Session storage in memory
- `InMemoryClientRequestAdapter` - Client request tracking in memory

### Custom Adapters

Implement these interfaces for custom storage:

```typescript
interface SessionAdapter {
  generateSessionId(): string
  create(id: string, meta: SessionMeta): Promise<SessionData>
  has(id: string): Promise<boolean>
  get(id: string): Promise<SessionData | undefined>
  appendEvent(id: string, streamId: string, message: unknown): Promise<EventId>
  replay(id: string, lastEventId: EventId, write: WriteFunction): Promise<void>
  delete(id: string): Promise<void>
}

interface ClientRequestAdapter {
  createPending(sessionId: string, requestId: string, options): { promise: Promise<Response> }
  resolvePending(sessionId: string, requestId: string, response: Response): boolean
  rejectPending(sessionId: string, requestId: string, error: Error): boolean
}
```

See [examples/cloudflare-worker-kv-r2](./examples/cloudflare-worker-kv-r2) for a production implementation using Cloudflare KV.

## Quick Start

### Hono + Bun

```typescript
import { Hono } from "hono"
import { McpServer, StreamableHttpTransport } from "mcp-lite"
import { z } from "zod"

const server = new McpServer({
  name: "my-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType)
})
  .tool("echo", {
    inputSchema: z.object({ message: z.string() }),
    handler: (args) => ({
      content: [{ type: "text", text: args.message }]
    })
  })

const transport = new StreamableHttpTransport()
const handler = transport.bind(server)

const app = new Hono()
app.all("/mcp", async (c) => await handler(c.req.raw))

export default app
```

Run: `bun run index.ts`

### Cloudflare Workers

```typescript
import { McpServer, StreamableHttpTransport, InMemorySessionAdapter } from "mcp-lite"
import { z } from "zod"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const server = new McpServer({
      name: "worker-server",
      version: "1.0.0",
      schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType)
    })
      .tool("echo", {
        inputSchema: z.object({ message: z.string() }),
        handler: (args) => ({
          content: [{ type: "text", text: args.message }]
        })
      })

    const transport = new StreamableHttpTransport({
      sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 })
    })
    const handler = transport.bind(server)

    return handler(request)
  }
}
```

Deploy: `wrangler deploy`

### Next.js App Router

```typescript
// app/api/mcp/route.ts
import { McpServer, StreamableHttpTransport } from "mcp-lite"
import { z } from "zod"

const server = new McpServer({
  name: "nextjs-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType)
})
  .tool("echo", {
    inputSchema: z.object({ message: z.string() }),
    handler: (args) => ({
      content: [{ type: "text", text: args.message }]
    })
  })

const transport = new StreamableHttpTransport()
const handler = transport.bind(server)

export async function POST(request: Request) {
  return handler(request)
}

export async function GET(request: Request) {
  return handler(request)
}

export async function DELETE(request: Request) {
  return handler(request)
}
```

### Express

```typescript
import express from "express"
import { McpServer, StreamableHttpTransport } from "mcp-lite"
import { z } from "zod"

const server = new McpServer({
  name: "express-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType)
})
  .tool("echo", {
    inputSchema: z.object({ message: z.string() }),
    handler: (args) => ({
      content: [{ type: "text", text: args.message }]
    })
  })

const transport = new StreamableHttpTransport()
const handler = transport.bind(server)

const app = express()
app.all("/mcp", async (req, res) => {
  const response = await handler(req)
  res.status(response.status)
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.send(await response.text())
})

app.listen(3000)
```

## Tools

### Basic Tool with JSON Schema

```typescript
server.tool("add", {
  description: "Adds two numbers",
  inputSchema: {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["a", "b"],
  },
  outputSchema: {
    type: "object",
    properties: {
      result: { type: "number" },
    },
    required: ["result"],
  },
  handler: (args: { a: number; b: number }) => ({
    content: [{ type: "text", text: String(args.a + args.b) }],
    structuredContent: { result: args.a + args.b },
  }),
});
```

### Tool with Standard Schema (Zod)

```typescript
import { z } from "zod";

const AddInputSchema = z.object({
  a: z.number(),
  b: z.number(),
});

const AddOutputSchema = z.object({
  result: z.number(),
});

server.tool("add", {
  description: "Adds two numbers with structured output",
  inputSchema: AddInputSchema,
  outputSchema: AddOutputSchema,
  handler: (args) => ({
    content: [{ type: "text", text: String(args.a + args.b) }],
    structuredContent: { result: args.a + args.b },
  }),
});
```

### Tool without Schema

```typescript
server.tool("status", {
  description: "Returns server status",
  handler: () => ({
    content: [{ type: "text", text: "Server is running" }],
  }),
});
```

## Resources

Resources are URI-identified content.

### Static Resource

```typescript
server.resource(
  "file://config.json",
  {
    name: "App Configuration",
    description: "Application configuration file",
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
```

### Templated Resource

```typescript
server.resource(
  "github://repos/{owner}/{repo}",
  { description: "GitHub repository" },
  async (uri, { owner, repo }) => ({
    contents: [{
      uri: uri.href,
      type: "text",
      text: `Repository: ${owner}/${repo}`,
    }],
  })
);
```

## Prompts

Prompts generate message sequences for LLM conversations.

### Basic Prompt

```typescript
server.prompt("greet", {
  description: "Generate a greeting",
  handler: () => ({
    messages: [{
      role: "user",
      content: { type: "text", text: "Hello, how are you?" }
    }]
  })
});
```

### With Arguments

```typescript
import { z } from "zod";

const SummarySchema = z.object({
  text: z.string(),
  length: z.enum(["short", "medium", "long"]).optional(),
});

server.prompt("summarize", {
  description: "Create a summary prompt",
  arguments: SummarySchema,
  handler: (args) => ({
    description: "Summarization prompt",
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please summarize this text in ${args.length || "medium"} length:\n\n${args.text}`
      }
    }]
  })
});
```

## Middleware

Middleware functions run before request handlers:

```typescript
// Logging
server.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`${ctx.request.method} took ${Date.now() - start}ms`);
});

// Authentication
server.use(async (ctx, next) => {
  const token = ctx.request.headers?.get?.("Authorization");
  if (!token) throw new Error("Unauthorized");
  ctx.state.user = await validateToken(token);
  await next();
});

// Rate limiting
server.use(async (ctx, next) => {
  const userId = ctx.state.user?.id;
  if (await isRateLimited(userId)) {
    throw new Error("Rate limit exceeded");
  }
  await next();
});
```

## Server Composition

Mount child servers to create modular architectures:

```typescript
const gitServer = new McpServer({ name: "git", version: "1.0.0" })
  .tool("clone", { /* ... */ })
  .tool("commit", { /* ... */ });

const dbServer = new McpServer({ name: "database", version: "1.0.0" })
  .tool("query", { /* ... */ })
  .tool("migrate", { /* ... */ });

// With namespacing
const app = new McpServer({ name: "app", version: "1.0.0" })
  .group("git", gitServer)      // Registers: git/clone, git/commit
  .group("db", dbServer);        // Registers: db/query, db/migrate

// Without namespacing
const app2 = new McpServer({ name: "app", version: "1.0.0" })
  .group(gitServer)              // Registers: clone, commit
  .group(dbServer);              // Registers: query, migrate
```

See [examples/composing-servers](./examples/composing-servers) for details.

## Elicitation

Elicitation allows servers to request input from users during tool execution:

```typescript
import { z } from "zod";

server.tool("delete_record", {
  inputSchema: z.object({
    recordId: z.string(),
    tableName: z.string(),
  }),
  handler: async (args, ctx) => {
    if (!ctx.client.supports("elicitation")) {
      throw new Error("Elicitation not supported");
    }

    const response = await ctx.elicit({
      message: `Delete record "${args.recordId}" from "${args.tableName}"?`,
      schema: z.object({ confirmed: z.boolean() })
    });

    if (response.action === "accept" && response.content.confirmed) {
      await deleteFromDatabase(args.tableName, args.recordId);
      return { content: [{ type: "text", text: "Record deleted" }] };
    }

    return { content: [{ type: "text", text: "Deletion cancelled" }] };
  }
});
```

Elicitation requires both adapters:

```typescript
const transport = new StreamableHttpTransport({
  sessionAdapter: new InMemorySessionAdapter({ maxEventBufferSize: 1024 }),
  clientRequestAdapter: new InMemoryClientRequestAdapter({ defaultTimeoutMs: 30000 })
});
```

See [packages/core/README.elicitation.md](./packages/core/README.elicitation.md) for distributed implementations.

## Error Handling

```typescript
import { RpcError, JSON_RPC_ERROR_CODES } from "mcp-lite";

server.tool("divide", {
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  handler: (args) => {
    if (args.b === 0) {
      throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, "Division by zero");
    }
    return {
      content: [{ type: "text", text: String(args.a / args.b) }]
    };
  }
});

// Custom error handler
server.onError((error, ctx) => {
  if (error instanceof MyCustomError) {
    return {
      code: -32001,
      message: "Custom error",
      data: { requestId: ctx.requestId }
    };
  }
  // Return undefined for default handling
});
```

## Sessions

### Stateless Mode

Default mode with no session management:

```typescript
const transport = new StreamableHttpTransport();
```

### Stateful Mode

Enable sessions for SSE streaming and event replay:

```typescript
import { StreamableHttpTransport, InMemorySessionAdapter } from "mcp-lite";

const transport = new StreamableHttpTransport({
  sessionAdapter: new InMemorySessionAdapter({
    maxEventBufferSize: 1024
  })
});
```

This enables:
- Session persistence across requests
- SSE streaming via GET endpoint
- Event replay for reconnections
- Progress notifications

## Examples

- [playground/minimal-server.ts](./playground/minimal-server.ts) - Basic stateless server
- [examples/validation-zod](./examples/validation-zod) - Zod validation
- [examples/validation-valibot](./examples/validation-valibot) - Valibot validation
- [examples/validation-effectschema](./examples/validation-effectschema) - Effect Schema
- [examples/composing-servers](./examples/composing-servers) - Server composition
- [examples/cloudflare-worker-kv-r2](./examples/cloudflare-worker-kv-r2) - Cloudflare Workers with KV
- [examples/auth-clerk](./examples/auth-clerk) - Authentication with Clerk

## Protocol

Supports MCP protocol version `2025-06-18` with JSON-RPC 2.0 compliance.
