# mcp-lite

A small, fetch-first implementation of the Model Context Protocol (MCP) server APIs.

`mcp-lite` is a ground-up rewrite of the TypeScript MCP SDK. It keeps only the pieces you need to stand up a server: JSON-RPC handling, typed tool definitions, and an HTTP + SSE transport that works anywhere `Request` and `Response` are available (Node, Bun, Cloudflare Workers, Deno, browsers with Service Workers).

You get:
- A minimal core (`packages/core`) with zero runtime dependencies.
- Opt-in adapters for sessions and client calls so you can start without state and add storage when you need it.
- Plain TypeScript APIs that line up with the MCP spec and stay close to the wire format.

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

- No runtime dependencies and a single TypeScript entrypoint.
- Type-safe tool definitions with Standard Schema (Zod, Valibot, Effect, ArkType).
- Structured outputs with runtime validation and schema exposure via `tools/list`.
- HTTP + SSE transport built on the Fetch API (no stdio wrapper required).
- Adapter interfaces for sessions, client requests, and persistence when you outgrow stateless mode.
- Middleware hooks and server composition via `.group()` for modular setups.

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

You can begin with a single file server and add state only when you need it. Adapters let you swap in storage or queueing code without touching tools or handlers.

### Scaling playbook

- **Local prototyping:** run the transport with no adapters. Every request is stateless and there is nothing to clean up.
- **Single server:** add `InMemorySessionAdapter` (and optionally `InMemoryClientRequestAdapter`) to keep progress events and elicitations alive across multiple requests from the same client.
- **Distributed or serverless:** implement the adapter interfaces against Redis, KV, Durable Objects, or queues. See the Cloudflare Workers example for a working KV-backed adapter.

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

### Client Requests and Elicitation

The server can send JSON-RPC requests back to the MCP client (for example when you call `ctx.elicit`). Those requests are routed through the `ClientRequestAdapter`. Provide one when you need:
- Timeouts or retries for client prompts.
- To make sure an elicitation response is delivered even when the original POST is finished.
- To back the pending requests with shared storage in a multi-instance deployment.

The in-memory adapter covers local runs. For production you can implement `ClientRequestAdapter` using Redis, D1, Durable Objects, or any queue that can look up pending requests by session and request id.

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

## Runtime Environments

`StreamableHttpTransport` runs anywhere the Fetch API is built in:
- Node.js 18+, Bun, and Deno.
- Cloudflare Workers and other service-worker runtimes.
- Browser extensions or Service Workers that expose Fetch.

For Node.js 16 or earlier, install a Fetch polyfill before creating the transport.

## Quick Start

The snippets below show how to host the same server across different runtimes.

### Hono + Bun

Run a stateless server on Bun using the Hono router.

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

Deploy the same server on Cloudflare Workers with in-memory sessions to keep progress events.

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

Expose MCP over the Next.js App Router without writing custom request plumbing.

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

Bridge the transport into an existing Express application.

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

## Examples

The repo includes runnable samples that show different adapters and runtimes:
- `examples/cloudflare-worker-kv-r2` – Workers runtime with KV and R2-backed adapters.
- `examples/composing-servers` – Multiple servers grouped behind one transport.
- `examples/validation-arktype` – Standard Schema via ArkType.
- `examples/validation-valibot` – Validation using Valibot.
- `examples/validation-effectschema` – Validation with Effect Schema.
- `examples/validation-zod` – Validation with Zod.
- `playground/minimal-server.ts` – Small Bun server for local testing.
- `examples/auth-clerk` – Adds Clerk auth middleware and guards.

## MCP Concepts

The sections below map directly to the MCP specification: tools, resources, prompts, and elicitations.

### Tools

Tools expose callable functionality to MCP clients. Each variant below shows a different way to define inputs and outputs.

### Basic Tool with JSON Schema

Define a tool using plain JSON Schema input and output definitions.

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

Use a Standard Schema validator (Zod here) to infer handler types automatically.

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

Skip validation entirely for endpoints that return static information.

```typescript
server.tool("status", {
  description: "Returns server status",
  handler: () => ({
    content: [{ type: "text", text: "Server is running" }],
  }),
});
```

### Resources

Resources are URI-identified content.

### Static Resource

Serve fixed content for a specific URI.

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

Bind template variables from the URI before returning content.

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

### Prompts

Prompts generate message sequences for LLM conversations.

### Basic Prompt

Return a fixed message sequence.

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

Validate prompt arguments before building messages.

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

### Elicitation

Elicitation lets a tool request input from the client mid-execution. `mcp-lite` wires this through the same handler context:

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

## `mcp-lite` Features

### Middleware

`mcp-lite` lets you apply Express-style middleware to every request before it reaches a tool or prompt handler:

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

### Server Composition

Group smaller servers together while preserving their tooling and middleware:

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

### Error Handling

Throw `RpcError` to return structured JSON-RPC failures or customize `onError` for fallback logic.

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

### Sessions

#### Stateless Mode

Default mode with no session management:

```typescript
const transport = new StreamableHttpTransport();
```

#### Stateful Mode

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

## Protocol

Supports MCP protocol version `2025-06-18` with JSON-RPC 2.0 compliance.
