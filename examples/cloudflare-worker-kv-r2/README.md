# mcp-lite with Cloudflare bindings

This is an example of using mcp-lite with Cloudflare KV and R2, demonstrating:

- **KV storage for tools**: Making calls to KV from within tool handlers
- **Session persistence**: Using CloudflareKVSessionAdapter for session storage
- **Client request handling**: Using CloudflareKVClientRequestAdapter for async request processing

To make this work, we generate types for the Worker (`bun cf-typegen`), then import the bindings using:

```ts
import { env } from "cloudflare:workers";

// now `env.KV` gives us access to the KV store
// however! we can only call it from within an execution context (like inside a tool call)
```

## Architecture

This example includes two custom adapters:

### CloudflareKVSessionAdapter
- Stores MCP session data in Cloudflare KV
- Handles session lifecycle (create, get, update, delete)
- Manages event streaming with buffering and replay functionality
- Serializes Map-based session data to JSON for KV storage

### CloudflareKVClientRequestAdapter  
- Handles asynchronous client requests using KV for coordination
- Implements polling mechanism for request/response communication
- Manages request timeouts and cleanup

## Development

Run the development server

```sh
bun install
bun dev
```

## Configuration

The following three KV namespaces are enabled in the `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "KV",
    "id": "your-main-kv-namespace-id"
  },
  {
    "binding": "SESSIONS_KV", 
    "id": "your-sessions-kv-namespace-id"
  },
  {
    "binding": "PENDING_REQUESTS_KV",
    "id": "your-requests-kv-namespace-id"
  }
]
```

## Deployment 

```sh
bun run deploy
```

## Type Generation

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```sh
bun run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiation `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
